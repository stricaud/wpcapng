import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { LibpcapngModule, Summary } from "../engine";

const INTERVALS = [
  { label: "0.01 s", v: 0.01 },
  { label: "0.1 s", v: 0.1 },
  { label: "1 s", v: 1 },
  { label: "10 s", v: 10 },
  { label: "60 s", v: 60 },
];

const COLORS = ["#e8a33d", "#5fd35f", "#4a9eff", "#e8776b", "#b98bff", "#3ec9c9", "#f06fb0", "#c7c14a"];
const colorAt = (i: number) => COLORS[i % COLORS.length];

interface Row {
  id: number;
  filter: string; // display filter; empty = all packets. Also the series label.
  color: string;
  enabled: boolean;
  yaxis: "packets" | "bytes";
  error: string | null;
}

export default function IOGraph({
  engine,
  summaries,
  onClose,
}: {
  engine: LibpcapngModule;
  summaries: Summary[];
  onClose: () => void;
}) {
  const [interval, setInterval] = useState(1);
  const idRef = useRef(1);
  const [rows, setRows] = useState<Row[]>([
    { id: 0, filter: "", color: colorAt(0), enabled: true, yaxis: "packets", error: null },
  ]);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  const buckets = useMemo(() => {
    const maxT = summaries.length ? summaries[summaries.length - 1].time : 0;
    const nb = Math.max(1, Math.ceil((maxT + 1e-9) / interval));
    return { nb, labels: Array.from({ length: nb }, (_, i) => (i * interval).toFixed(2)) };
  }, [summaries, interval]);

  const label = (f: string) => f.trim() || "All packets";

  // Evaluate all enabled, valid filters in one pass, then bucketize each.
  const series = useMemo(() => {
    const active = rows.filter((r) => r.enabled && !r.error);
    if (active.length === 0) return [];
    const masks = engine.matchFilters(active.map((r) => r.filter));
    return active.map((r, k) => {
      const mask = masks[k];
      const data = new Array(buckets.nb).fill(0);
      for (let i = 0; i < summaries.length; i++) {
        if (!mask[i]) continue;
        const b = Math.min(buckets.nb - 1, Math.floor(summaries[i].time / interval));
        data[b] += r.yaxis === "bytes" ? summaries[i].length : 1;
      }
      return {
        name: label(r.filter),
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        data,
        itemStyle: { color: r.color },
        lineStyle: { color: r.color },
        yAxisIndex: r.yaxis === "bytes" ? 1 : 0,
      };
    });
  }, [rows, summaries, interval, buckets.nb, engine]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current, "dark");
    chartInst.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    const chart = chartInst.current;
    if (!chart) return;
    chart.setOption(
      {
        backgroundColor: "transparent",
        tooltip: { trigger: "axis" },
        legend: { data: series.map((s) => s.name), textStyle: { color: "#ccc" }, top: 0, type: "scroll" },
        grid: { left: 64, right: 64, top: 36, bottom: 56 },
        xAxis: { type: "category", data: buckets.labels, name: "Time (s)", nameLocation: "middle", nameGap: 30 },
        yAxis: [
          { type: "value", name: "Packets", position: "left" },
          { type: "value", name: "Bytes", position: "right" },
        ],
        dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 18 }],
        series,
      },
      { replaceMerge: ["series"] },
    );
  }, [series, buckets.labels]);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.filter !== undefined) {
          const res = patch.filter.trim() ? engine.validateFilter(patch.filter) : { ok: true, error: "" };
          next.error = res.ok ? null : res.error;
        }
        return next;
      }),
    );

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      { id: idRef.current++, filter: "", color: colorAt(rs.length), enabled: true, yaxis: "packets", error: null },
    ]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>IO Graph</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div ref={chartRef} style={{ width: "100%", height: 380 }} />

        <div className="fs-toolbar">
          <span className="dim">Interval</span>
          <select value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="sel">
            {INTERVALS.map((i) => (
              <option key={i.v} value={i.v}>{i.label}</option>
            ))}
          </select>
          <span className="spacer" />
          <button className="btn" onClick={addRow}>+ Add graph</button>
        </div>

        <table className="io-rows">
          <thead>
            <tr>
              <th></th>
              <th>Display filter (empty = all packets)</th>
              <th>Y axis</th>
              <th>Color</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} />
                </td>
                <td>
                  <input
                    className={`text-input compact mono${r.error ? " invalid" : ""}`}
                    value={r.filter}
                    placeholder="e.g. udp   ·   tcp.port == 443   ·   dns"
                    title={r.error ?? ""}
                    onChange={(e) => update(r.id, { filter: e.target.value })}
                  />
                </td>
                <td>
                  <select className="sel" value={r.yaxis} onChange={(e) => update(r.id, { yaxis: e.target.value as Row["yaxis"] })}>
                    <option value="packets">packets</option>
                    <option value="bytes">bytes</option>
                  </select>
                </td>
                <td>
                  <input type="color" value={r.color} onChange={(e) => update(r.id, { color: e.target.value })} />
                </td>
                <td>
                  <button className="btn small" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.some((r) => r.error) && (
          <div className="note err" style={{ marginTop: 8 }}>
            {rows.find((r) => r.error)?.error}
          </div>
        )}
      </div>
    </div>
  );
}
