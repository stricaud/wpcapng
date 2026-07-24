import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { LibpcapngModule } from "../engine";
import { formatBytes } from "../util";

export default function EntityExplorer({
  engine,
  onClose,
}: {
  engine: LibpcapngModule;
  onClose: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  const { nodes, links } = useMemo(() => {
    const eps = engine.getEndpoints();
    const convs = engine.getConversations();
    const maxBytes = Math.max(1, ...eps.map((e) => e.bytes));
    const nodes = eps.map((e) => ({
      name: e.address,
      value: e.bytes,
      symbolSize: 10 + 42 * Math.sqrt(e.bytes / maxBytes),
      label: { show: e.bytes > maxBytes * 0.15 },
      tooltip: { formatter: `${e.address}<br/>${e.packets} pkts · ${formatBytes(e.bytes)}` },
    }));
    const maxConv = Math.max(1, ...convs.map((c) => c.bytes));
    const links = convs.map((c) => ({
      source: c.addrA,
      target: c.addrB,
      value: c.bytes,
      lineStyle: { width: 1 + 6 * (c.bytes / maxConv), opacity: 0.6, curveness: 0.05 },
      tooltip: { formatter: `${c.proto} ${c.addrA}:${c.portA} ↔ ${c.addrB}:${c.portB}<br/>${c.packets} pkts · ${formatBytes(c.bytes)}` },
    }));
    return { nodes, links };
  }, [engine]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current, "dark");
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {},
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          data: nodes,
          links,
          force: { repulsion: 220, edgeLength: [60, 180], gravity: 0.08 },
          label: { color: "#ddd", fontSize: 11, position: "right" },
          lineStyle: { color: "#6b8299" },
          emphasis: { focus: "adjacency", lineStyle: { width: 4 } },
          itemStyle: { color: "#4a9eff" },
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [nodes, links]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Entity Explorer <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>({nodes.length} hosts · {links.length} flows)</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="dim" style={{ marginBottom: 6 }}>
          Node size = bytes per host · edge width = bytes per conversation · scroll to zoom, drag to move.
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 560 }} />
      </div>
    </div>
  );
}
