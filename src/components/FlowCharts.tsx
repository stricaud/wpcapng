import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { LibpcapngModule, Summary } from "../engine";

type View = "sankey" | "heatmap";

export default function FlowCharts({
  engine,
  summaries,
  onClose,
}: {
  engine: LibpcapngModule;
  summaries: Summary[];
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("sankey");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  // Sankey — role-prefixed node names so a host on both sides can't form a cycle.
  const sankey = useMemo(() => {
    const convs = engine.getConversations().sort((a, b) => b.bytes - a.bytes).slice(0, 40);
    const nodes = new Map<string, { name: string }>();
    const links = convs.map((c) => {
      const s = `${c.addrA} ▶`, t = `◀ ${c.addrB}`;
      nodes.set(s, { name: s });
      nodes.set(t, { name: t });
      return { source: s, target: t, value: c.bytes };
    });
    return { nodes: [...nodes.values()], links };
  }, [engine]);

  // Talker heatmap — top hosts (senders) × time buckets, colored by bytes.
  const heat = useMemo(() => {
    const maxT = summaries.length ? summaries[summaries.length - 1].time : 0;
    const iv = maxT > 60 ? 1 : maxT > 6 ? 0.1 : 0.01;
    const nb = Math.max(1, Math.ceil((maxT + 1e-9) / iv));
    const totals = new Map<string, number>();
    for (const s of summaries) totals.set(s.src, (totals.get(s.src) ?? 0) + s.length);
    const hosts = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map((e) => e[0]);
    const hi = new Map(hosts.map((h, i) => [h, i]));
    const data: [number, number, number][] = [];
    const grid = hosts.map(() => new Array(nb).fill(0));
    for (const s of summaries) {
      const r = hi.get(s.src);
      if (r == null) continue;
      grid[r][Math.min(nb - 1, Math.floor(s.time / iv))] += s.length;
    }
    let max = 1;
    grid.forEach((row, r) => row.forEach((v, c) => { if (v > 0) { data.push([c, r, v]); max = Math.max(max, v); } }));
    const xlabels = Array.from({ length: nb }, (_, i) => (i * iv).toFixed(2));
    return { hosts, xlabels, data, max, iv };
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
    if (view === "sankey") {
      option = {
        tooltip: { trigger: "item", formatter: (o: any) => (o.dataType === "edge" ? `${o.data.source} → ${o.data.target}<br/>${o.data.value} bytes` : o.name) },
        series: [{
          type: "sankey", data: sankey.nodes, links: sankey.links,
          nodeAlign: "justify", label: { color: "#ddd", fontSize: 11 },
          lineStyle: { color: "gradient", opacity: 0.5 }, emphasis: { focus: "adjacency" },
        } as any],
      };
    } else {
      option = {
        tooltip: { position: "top", formatter: (o: any) => `${heat.hosts[o.value[1]]}<br/>t=${heat.xlabels[o.value[0]]}s · ${o.value[2]} bytes` },
        grid: { left: 150, right: 30, top: 20, bottom: 60 },
        xAxis: { type: "category", data: heat.xlabels, name: "Time (s)", nameLocation: "middle", nameGap: 30, axisLabel: { interval: Math.ceil(heat.xlabels.length / 20) } },
        yAxis: { type: "category", data: heat.hosts },
        visualMap: { min: 0, max: heat.max, calculable: true, orient: "horizontal", left: "center", bottom: 10, inRange: { color: ["#12203a", "#2f7fd1", "#e8a33d", "#e8776b"] } },
        series: [{ type: "heatmap", data: heat.data, emphasis: { itemStyle: { borderColor: "#fff", borderWidth: 1 } } }],
      };
    }
    chart.setOption(option, true);
  }, [view, sankey, heat]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Flow Analysis</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <select className="sel" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="sankey">Conversation Sankey (by bytes)</option>
            <option value="heatmap">Talker heatmap (host × time)</option>
          </select>
          <span className="dim">{view === "sankey" ? "top 40 conversations" : "top 20 senders"}</span>
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 520 }} />
      </div>
    </div>
  );
}
