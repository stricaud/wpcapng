import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { Summary } from "../engine";

const INTERVALS = [
  { label: "0.01 s", v: 0.01 },
  { label: "0.1 s", v: 0.1 },
  { label: "1 s", v: 1 },
  { label: "10 s", v: 10 },
  { label: "60 s", v: 60 },
];

export default function IOGraph({
  summaries,
  onClose,
}: {
  summaries: Summary[];
  onClose: () => void;
}) {
  const [interval, setInterval] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  const { buckets, packets, bytes } = useMemo(() => {
    const maxT = summaries.length ? summaries[summaries.length - 1].time : 0;
    const nb = Math.max(1, Math.ceil((maxT + 1e-9) / interval));
    const pk = new Array(nb).fill(0);
    const by = new Array(nb).fill(0);
    for (const s of summaries) {
      const b = Math.min(nb - 1, Math.floor(s.time / interval));
      pk[b] += 1;
      by[b] += s.length;
    }
    const bx = Array.from({ length: nb }, (_, i) => (i * interval).toFixed(2));
    return { buckets: bx, packets: pk, bytes: by };
  }, [summaries, interval]);

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
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: { data: ["Packets", "Bytes"], textStyle: { color: "#ccc" } },
      grid: { left: 60, right: 60, top: 40, bottom: 50 },
      xAxis: {
        type: "category",
        data: buckets,
        name: "Time (s)",
        nameLocation: "middle",
        nameGap: 30,
      },
      yAxis: [
        { type: "value", name: "Packets", position: "left" },
        { type: "value", name: "Bytes", position: "right" },
      ],
      dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 16 }],
      series: [
        { name: "Packets", type: "bar", data: packets, itemStyle: { color: "#4a9eff" }, yAxisIndex: 0 },
        { name: "Bytes", type: "line", data: bytes, smooth: true, itemStyle: { color: "#e8a33d" }, yAxisIndex: 1 },
      ],
    });
  }, [buckets, packets, bytes]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>IO Graph</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <span className="dim">Interval</span>
          <select value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="sel">
            {INTERVALS.map((i) => (
              <option key={i.v} value={i.v}>{i.label}</option>
            ))}
          </select>
          <span className="spacer" />
          <span className="dim">{summaries.length} packets</span>
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 420 }} />
      </div>
    </div>
  );
}
