import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { LibpcapngModule } from "../engine";
import { classify, lookup, loadGeo, type GeoDB } from "../geoip";
import { formatBytes } from "../util";

export default function GeoMap({
  engine,
  onClose,
}: {
  engine: LibpcapngModule;
  onClose: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const [reader, setReader] = useState<GeoDB | null | undefined>(undefined);
  const [geo, setGeo] = useState<any | null | undefined>(undefined);

  useEffect(() => {
    loadGeo().then(setReader);
    fetch(`${import.meta.env.BASE_URL}world.geo.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (g?.features)
          for (const f of g.features) {
            const p = f.properties || {};
            p.iso = p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ISO_A2 || "";
          }
        setGeo(g);
      })
      .catch(() => setGeo(null));
  }, []);

  const agg = useMemo(() => {
    const byCountry = new Map<string, { bytes: number; hosts: number }>();
    const byAsn = new Map<string, { bytes: number; hosts: number }>();
    let priv = 0, reserved = 0, unknown = 0;
    if (reader) {
      for (const e of engine.getEndpoints()) {
        const cls = classify(e.address);
        if (cls === "loopback" || cls === "reserved" || cls === "linklocal" || cls === "multicast") { reserved += e.bytes; continue; }
        if (cls === "private") { priv += e.bytes; continue; }
        const g = lookup(reader, e.address);
        if (g.country) {
          const c = byCountry.get(g.country) ?? { bytes: 0, hosts: 0 };
          c.bytes += e.bytes; c.hosts++; byCountry.set(g.country, c);
        } else unknown += e.bytes;
        if (g.asn) {
          const key = `AS${g.asn}${g.org ? " " + g.org : ""}`;
          const a = byAsn.get(key) ?? { bytes: 0, hosts: 0 };
          a.bytes += e.bytes; a.hosts++; byAsn.set(key, a);
        }
      }
    }
    return { byCountry, byAsn, priv, reserved, unknown };
  }, [engine, reader]);

  useEffect(() => {
    if (!chartRef.current || !geo) return;
    echarts.registerMap("world", geo, {});
    const chart = echarts.init(chartRef.current, "dark");
    chartInst.current = chart;
    const data = [...agg.byCountry.entries()].map(([iso, v]) => ({ name: iso, value: v.bytes, hosts: v.hosts }));
    const max = Math.max(1, ...data.map((d) => d.value));
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", formatter: (o: any) => (o.data ? `${o.name}: ${o.data.hosts} hosts · ${formatBytes(o.data.value)}` : o.name) },
      visualMap: { min: 0, max, calculable: true, left: 10, bottom: 10, orient: "horizontal", text: ["more", "less"], inRange: { color: ["#16304a", "#2f7fd1", "#e8a33d", "#e8776b"] }, textStyle: { color: "#ccc" } },
      series: [{ type: "map", map: "world", nameProperty: "iso", roam: true, data, itemStyle: { areaColor: "#222", borderColor: "#444" }, emphasis: { label: { show: false }, itemStyle: { areaColor: "#3a7" } } }],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.dispose(); };
  }, [geo, agg]);

  const topCountries = [...agg.byCountry.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10);
  const topAsn = [...agg.byAsn.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10);
  const needAssets = reader === null || geo === null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>GeoIP Map <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>country &amp; ASN</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {needAssets ? (
          <div className="note err">
            GeoIP assets not found. Generate them once with <span className="mono">npm run build:geoip</span> (needs
            internet), then commit <span className="mono">public/geoip-country.bin</span> and{" "}
            <span className="mono">public/world.geo.json</span>.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            <div ref={chartRef} style={{ flex: 1, height: 520 }} />
            <div style={{ width: 260, overflow: "auto", maxHeight: 520 }}>
              <h3>Top countries</h3>
              <table className="data-table">
                <tbody>
                  {topCountries.map(([iso, v]) => (
                    <tr key={iso}><td>{iso}</td><td className="num">{v.hosts}</td><td className="num">{formatBytes(v.bytes)}</td></tr>
                  ))}
                </tbody>
              </table>
              <h3>Top ASNs</h3>
              <table className="data-table">
                <tbody>
                  {topAsn.map(([k, v]) => (
                    <tr key={k}><td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={k}>{k}</td><td className="num">{formatBytes(v.bytes)}</td></tr>
                  ))}
                </tbody>
              </table>
              <h3>Non-geolocated</h3>
              <table className="data-table">
                <tbody>
                  <tr><td>Private</td><td className="num">{formatBytes(agg.priv)}</td></tr>
                  <tr><td>Reserved</td><td className="num">{formatBytes(agg.reserved)}</td></tr>
                  <tr><td>Public, unknown</td><td className="num">{formatBytes(agg.unknown)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
