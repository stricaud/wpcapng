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

const COLORS = ["#4a9eff", "#e8a33d", "#5fd35f", "#e8776b", "#b98bff", "#3ec9c9", "#f06fb0", "#c7c14a"];

interface Row {
  id: number;
  name: string;
  filter: string;
  color: string;
  enabled: boolean;
  yaxis: "packets" | "bytes";
  error: string | null;
}

let nextId = 1;
const mkRow = (over: Partial<Row> = {}): Row => ({
  id: nextId++,
  name: over.name ?? "All packets",
  filter: over.filter ?? "",
  color: over.color ?? COLORS[(nextId - 1) % COLORS.length],
  enabled: over.enabled ?? true,
  yaxis: over.yaxis ?? "packets",
  error: null,
  ...over,
});

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
  const [rows, setRows] = useState<Row[]>([mkRow({ name: "All packets", filter: "" })]);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  const buckets = useMemo(() => {
    const maxT = summaries.length ? summaries[summaries.length - 1].time : 0;
    const nb = Math.max(1, Math.ceil((maxT + 1e-9) / interval));
    return { nb, labels: Array.from({ length: nb }, (_, i) => (i * interval).toFixed(2)) };
  }, [summaries, interval]);

  // Evaluate all enabled filters in one pass, then bucketize each.
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
        name: r.name || r.filter || "All",
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        data,
        itemStyle: { color: r.color },
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
        legend: { data: series.map((s) => s.name), textStyle: { color: "#ccc" }, top: 0 },
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
          <button className="btn" onClick={() => setRows((rs) => [...rs, mkRow({ name: "", filter: "" })])}>
            + Add filter
          </button>
        </div>

        <table className="io-rows">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Display filter</th>
              <th>Y</th>
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
                  <input className="text-input compact" value={r.name} placeholder="(name)" onChange={(e) => update(r.id, { name: e.target.value })} />
                </td>
                <td>
                  <input
                    className={`text-input compact mono${r.error ? " invalid" : ""}`}
                    value={r.filter}
                    placeholder="(all packets)"
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
      </div>
    </div>
  );
}
