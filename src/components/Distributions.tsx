import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { Summary } from "../engine";

type View = "length" | "iat" | "lenbox";

const LEN_BINS = [
  [0, 63], [64, 127], [128, 255], [256, 511], [512, 1023], [1024, 1517], [1518, Infinity],
];
const LEN_LABELS = ["0–63", "64–127", "128–255", "256–511", "512–1023", "1024–1517", "1518+"];

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export default function Distributions({
  summaries,
  onClose,
}: {
  summaries: Summary[];
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("length");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  const lenHist = useMemo(() => {
    const c = new Array(LEN_BINS.length).fill(0);
    for (const s of summaries) {
      const i = LEN_BINS.findIndex(([lo, hi]) => s.length >= lo && s.length <= hi);
      if (i >= 0) c[i]++;
    }
    return c;
  }, [summaries]);

  const iatHist = useMemo(() => {
    const diffs: number[] = [];
    for (let i = 1; i < summaries.length; i++) diffs.push((summaries[i].time - summaries[i - 1].time) * 1000);
    diffs.sort((a, b) => a - b);
    const max = diffs.length ? quantile(diffs, 0.95) || diffs[diffs.length - 1] || 1 : 1;
    const nb = 30;
    const w = max / nb || 1;
    const bins = new Array(nb).fill(0);
    for (const d of diffs) bins[Math.min(nb - 1, Math.floor(d / w))]++;
    const labels = Array.from({ length: nb }, (_, i) => (i * w).toFixed(2));
    return { bins, labels, w };
  }, [summaries]);

  const box = useMemo(() => {
    const byProto = new Map<string, number[]>();
    for (const s of summaries) (byProto.get(s.proto) ?? byProto.set(s.proto, []).get(s.proto)!).push(s.length);
    const top = [...byProto.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    const names = top.map((e) => e[0]);
    const data = top.map(([, lens]) => {
      const s = [...lens].sort((a, b) => a - b);
      return [s[0], quantile(s, 0.25), quantile(s, 0.5), quantile(s, 0.75), s[s.length - 1]];
    });
    return { names, data };
  }, [summaries]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current, "dark");
    chartInst.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.dispose(); };
  }, []);

  useEffect(() => {
    const chart = chartInst.current;
    if (!chart) return;
    let option: echarts.EChartsOption;
    if (view === "length") {
      option = {
        title: { text: "Frame length distribution", textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "axis" },
        grid: { left: 60, right: 24, top: 40, bottom: 50 },
        xAxis: { type: "category", data: LEN_LABELS, name: "Bytes", nameLocation: "middle", nameGap: 30 },
        yAxis: { type: "value", name: "Packets" },
        series: [{ type: "bar", data: lenHist, itemStyle: { color: "#4a9eff" } }],
      };
    } else if (view === "iat") {
      option = {
        title: { text: "Inter-arrival time distribution", textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "axis" },
        grid: { left: 60, right: 24, top: 40, bottom: 50 },
        xAxis: { type: "category", data: iatHist.labels, name: "ms (≤ p95)", nameLocation: "middle", nameGap: 30, axisLabel: { interval: 3 } },
        yAxis: { type: "value", name: "Packets" },
        series: [{ type: "bar", data: iatHist.bins, itemStyle: { color: "#e8a33d" } }],
      };
    } else {
      option = {
        title: { text: "Frame length by protocol", textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "item" },
        grid: { left: 60, right: 24, top: 40, bottom: 70 },
        xAxis: { type: "category", data: box.names, axisLabel: { rotate: 30 } },
        yAxis: { type: "value", name: "Bytes" },
        series: [{ type: "boxplot", data: box.data, itemStyle: { color: "#14322a", borderColor: "#5fd35f" } }],
      };
    }
    chart.setOption(option, true);
  }, [view, lenHist, iatHist, box]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Packet Distributions</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <select className="sel" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="length">Frame length histogram</option>
            <option value="iat">Inter-arrival time</option>
            <option value="lenbox">Length by protocol (boxplot)</option>
          </select>
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 460 }} />
      </div>
    </div>
  );
}
