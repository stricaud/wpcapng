import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { HierarchyNode, LibpcapngModule, Summary } from "../engine";

type View = "sunburst" | "treemap" | "river";

function toTree(n: HierarchyNode): any {
  return { name: n.name || n.abbrev, value: n.bytes, children: n.children.map(toTree) };
}

export default function ProtocolCharts({
  engine,
  summaries,
  onClose,
}: {
  engine: LibpcapngModule;
  summaries: Summary[];
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("sunburst");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const tree = useMemo(() => engine.getProtocolHierarchy().map(toTree), [engine]);

  // themeRiver: bytes per (top-level) protocol over time
  const river = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of summaries) totals.set(s.proto, (totals.get(s.proto) ?? 0) + s.length);
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
    const keep = new Set(top);
    const maxT = summaries.length ? summaries[summaries.length - 1].time : 0;
    const iv = maxT > 60 ? 1 : maxT > 6 ? 0.1 : 0.01;
    const nb = Math.max(1, Math.ceil((maxT + 1e-9) / iv));
    const byName: Record<string, number[]> = {};
    const nameOf = (p: string) => (keep.has(p) ? p : "other");
    for (const s of summaries) {
      const nm = nameOf(s.proto);
      (byName[nm] ??= new Array(nb).fill(0))[Math.min(nb - 1, Math.floor(s.time / iv))] += s.length;
    }
    const data: [number, number, string][] = [];
    for (const [nm, arr] of Object.entries(byName))
      arr.forEach((v, i) => data.push([+(i * iv).toFixed(3), v, nm]));
    return { data, names: Object.keys(byName) };
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
    if (view === "sunburst") {
      option = {
        tooltip: {},
        series: [{ type: "sunburst", data: tree, radius: [0, "92%"], label: { color: "#eee", minAngle: 8 },
          emphasis: { focus: "ancestor" }, levels: [] } as any],
      };
    } else if (view === "treemap") {
      option = {
        tooltip: {},
        series: [{ type: "treemap", data: tree, roam: false, label: { color: "#fff" },
          levels: [{ itemStyle: { borderColor: "#1e1e1e", borderWidth: 2, gapWidth: 2 } }, { itemStyle: { gapWidth: 1 } }] } as any],
      };
    } else {
      option = {
        tooltip: { trigger: "axis", axisPointer: { type: "line" } },
        legend: { data: river.names, textStyle: { color: "#ccc" }, top: 0 },
        singleAxis: { type: "value", name: "Time (s)", nameLocation: "middle", nameGap: 26, bottom: 40, top: 40 },
        series: [{ type: "themeRiver", data: river.data, label: { show: false },
          emphasis: { itemStyle: { shadowBlur: 12 } } } as any],
      };
    }
    chart.setOption(option, true);
  }, [view, tree, river]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Protocol Breakdown</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <select className="sel" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="sunburst">Sunburst (hierarchy by bytes)</option>
            <option value="treemap">Treemap (hierarchy by bytes)</option>
            <option value="river">Traffic over time (by protocol)</option>
          </select>
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 520 }} />
      </div>
    </div>
  );
}
