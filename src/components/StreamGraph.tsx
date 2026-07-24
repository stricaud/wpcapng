import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { LibpcapngModule } from "../engine";

type GraphType = "seq" | "throughput" | "window" | "rtt";

export default function StreamGraph({
  engine,
  index,
  onClose,
}: {
  engine: LibpcapngModule;
  index: number;
  onClose: () => void;
}) {
  const [gtype, setGType] = useState<GraphType>("seq");
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  const tl = useMemo(() => engine.getStreamPackets(index), [engine, index]);

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
    if (!chart || !tl) return;
    const pkts = tl.packets;
    const t0 = pkts.length ? pkts[0].time : 0;
    // relative initial sequence per direction (Wireshark-style)
    const initSeq: (number | null)[] = [null, null];
    for (const p of pkts) if (initSeq[p.dir] == null) initSeq[p.dir] = p.seq;
    const rel = (p: { dir: 0 | 1; seq: number }) => p.seq - (initSeq[p.dir] ?? 0);

    let option: echarts.EChartsOption;

    if (gtype === "seq") {
      const c2s = pkts.filter((p) => p.dir === 0).map((p) => [p.time - t0, rel(p)]);
      const s2c = pkts.filter((p) => p.dir === 1).map((p) => [p.time - t0, rel(p)]);
      option = {
        title: { text: "Time / Sequence", textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "item" },
        legend: { data: ["client → server", "server → client"], textStyle: { color: "#ccc" }, top: 0 },
        grid: { left: 70, right: 24, top: 40, bottom: 50 },
        xAxis: { type: "value", name: "Time (s)", nameLocation: "middle", nameGap: 28 },
        yAxis: { type: "value", name: "Relative seq #", nameGap: 50, nameLocation: "middle" },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 14 }],
        series: [
          { name: "client → server", type: "scatter", symbolSize: 5, data: c2s, itemStyle: { color: "#4a9eff" } },
          { name: "server → client", type: "scatter", symbolSize: 5, data: s2c, itemStyle: { color: "#e8776b" } },
        ],
      };
    } else if (gtype === "window") {
      const c2s = pkts.filter((p) => p.dir === 0).map((p) => [p.time - t0, p.win]);
      const s2c = pkts.filter((p) => p.dir === 1).map((p) => [p.time - t0, p.win]);
      option = {
        title: { text: "Advertised Window", textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "axis" },
        legend: { data: ["client → server", "server → client"], textStyle: { color: "#ccc" }, top: 0 },
        grid: { left: 70, right: 24, top: 40, bottom: 50 },
        xAxis: { type: "value", name: "Time (s)", nameLocation: "middle", nameGap: 28 },
        yAxis: { type: "value", name: "Window", nameGap: 50, nameLocation: "middle" },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 14 }],
        series: [
          { name: "client → server", type: "line", step: "end", showSymbol: false, data: c2s, itemStyle: { color: "#4a9eff" } },
          { name: "server → client", type: "line", step: "end", showSymbol: false, data: s2c, itemStyle: { color: "#e8776b" } },
        ],
      };
    } else if (gtype === "throughput") {
      const span = (pkts[pkts.length - 1]?.time ?? t0) - t0 || 1;
      const iv = span > 60 ? 1 : span > 6 ? 0.1 : 0.01;
      const nb = Math.max(1, Math.ceil(span / iv));
      const mk = (dir: 0 | 1) => {
        const b = new Array(nb).fill(0);
        for (const p of pkts) if (p.dir === dir) b[Math.min(nb - 1, Math.floor((p.time - t0) / iv))] += p.len;
        return b.map((v, i) => [i * iv, v / iv]);
      };
      option = {
        title: { text: `Throughput (bytes/s, ${iv}s bins)`, textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "axis" },
        legend: { data: ["client → server", "server → client"], textStyle: { color: "#ccc" }, top: 0 },
        grid: { left: 70, right: 24, top: 40, bottom: 50 },
        xAxis: { type: "value", name: "Time (s)", nameLocation: "middle", nameGap: 28 },
        yAxis: { type: "value", name: "Bytes/s", nameGap: 56, nameLocation: "middle" },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 14 }],
        series: [
          { name: "client → server", type: "line", areaStyle: {}, smooth: true, showSymbol: false, data: mk(0), itemStyle: { color: "#4a9eff" } },
          { name: "server → client", type: "line", areaStyle: {}, smooth: true, showSymbol: false, data: mk(1), itemStyle: { color: "#e8776b" } },
        ],
      };
    } else {
      // RTT: match each data segment's highest seq to the first opposite-direction
      // ACK that covers it. Approximate but useful for spotting spikes.
      const pending: Record<number, number[]> = { 0: [], 1: [] }; // dir → times keyed elsewhere
      const acksNeeded: { dir: 0 | 1; upto: number; t: number }[] = [];
      const rtts: [number, number][] = [];
      for (const p of pkts) {
        if (p.len > 0) acksNeeded.push({ dir: p.dir, upto: p.seq + p.len, t: p.time });
        // this packet's ack may satisfy pending data from the other direction
        for (let i = acksNeeded.length - 1; i >= 0; i--) {
          const a = acksNeeded[i];
          if (a.dir !== p.dir && p.ack >= a.upto) {
            rtts.push([a.t - t0, (p.time - a.t) * 1000]);
            acksNeeded.splice(i, 1);
          }
        }
      }
      void pending;
      option = {
        title: { text: "Round-trip time (ACK latency)", textStyle: { color: "#ccc", fontSize: 13 } },
        tooltip: { trigger: "item", formatter: (o: any) => `t=${o.value[0].toFixed(3)}s<br/>RTT=${o.value[1].toFixed(2)} ms` },
        grid: { left: 70, right: 24, top: 40, bottom: 50 },
        xAxis: { type: "value", name: "Time (s)", nameLocation: "middle", nameGap: 28 },
        yAxis: { type: "value", name: "RTT (ms)", nameGap: 50, nameLocation: "middle" },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 14 }],
        series: [{ type: "scatter", symbolSize: 5, data: rtts, itemStyle: { color: "#5fd35f" } }],
      };
    }
    chart.setOption(option, true);
  }, [tl, gtype]);

  if (!tl) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head"><h2>TCP Stream Graph</h2><button className="btn" onClick={onClose}>✕</button></div>
          <p className="dim">Select a TCP/UDP packet to graph its stream.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Stream Graph <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>
            {tl.clientIp}:{tl.clientPort} ↔ {tl.serverIp}:{tl.serverPort} · {tl.packets.length} pkts
          </span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <span className="dim">Graph</span>
          <select className="sel" value={gtype} onChange={(e) => setGType(e.target.value as GraphType)}>
            <option value="seq">Time / Sequence (Stevens)</option>
            <option value="throughput">Throughput</option>
            <option value="window">Window size</option>
            <option value="rtt">Round-trip time</option>
          </select>
        </div>
        <div ref={chartRef} style={{ width: "100%", height: 460 }} />
      </div>
    </div>
  );
}
