import { useEffect, useMemo, useRef, useState } from "react";
import { getEngine, type Field, type LibpcapngModule, type Summary } from "./engine";
import { applyStored, loadStored } from "./posaStore";
import PacketList from "./components/PacketList";
import DetailTree from "./components/DetailTree";
import HexView from "./components/HexView";
import PosaManager from "./components/PosaManager";

export default function App() {
  const [engine, setEngine] = useState<LibpcapngModule | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Field[] | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [highlight, setHighlight] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPosa, setShowPosa] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Boot the WASM engine and apply any saved posa decoders.
  useEffect(() => {
    getEngine().then((m) => {
      applyStored(m, loadStored());
      setEngine(m);
    });
  }, []);

  async function openFile(file: File) {
    if (!engine) return;
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      engine.loadCapture(buf);
      setFileName(file.name);
      setSummaries(engine.getSummaries());
      setSelected(null);
      setDetail(null);
      setBytes(null);
      setHighlight(null);
    } finally {
      setBusy(false);
    }
  }

  function selectPacket(idx: number) {
    if (!engine) return;
    setSelected(idx);
    setDetail(engine.getDetail(idx));
    setBytes(engine.getPacketBytes(idx));
    setHighlight(null);
  }

  // Find the most specific (smallest) dissection field whose byte range covers
  // the given offset — the field a clicked/hovered byte belongs to.
  function fieldAtOffset(off: number): [number, number] | null {
    if (!detail) return null;
    let best: Field | null = null;
    const visit = (n: Field) => {
      // Skip the top-level "frame" meta-node: it spans the whole packet, so it
      // would swallow any byte that has no more specific field (e.g. an
      // undissected payload) and highlight everything.
      if (n.abbrev !== "frame" && n.len > 0 && off >= n.off && off < n.off + n.len) {
        if (!best || n.len < best.len) best = n;
      }
      n.children.forEach(visit);
    };
    detail.forEach(visit);
    // `best` is narrowed to Field inside the closure but TS widens it here.
    const f = best as Field | null;
    return f ? [f.off, f.len] : null;
  }

  // Simple case-insensitive substring filter across visible columns.
  // (Wireshark-style display filters — tcp.port == 443 — are a planned next step.)
  const rows = useMemo(() => {
    const all = summaries.map((s, idx) => ({ idx, s }));
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(({ s }) =>
      `${s.src} ${s.dst} ${s.proto} ${s.info}`.toLowerCase().includes(q),
    );
  }, [summaries, filter]);

  const activeHighlight = hover ?? highlight;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo">🦈</span>
          <span className="title">wpcapng</span>
          <span className="tag">Wireshark for the web</span>
        </div>
        <div className="toolbar-actions">
          <button className="btn primary" onClick={() => fileInput.current?.click()} disabled={!engine || busy}>
            {busy ? "Loading…" : "Open capture"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pcap,.pcapng,.cap"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
              e.target.value = "";
            }}
          />
          <input
            className="filter-input"
            placeholder="Filter (src, dst, protocol, info)…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={summaries.length === 0}
          />
          <button className="btn" onClick={() => setShowPosa(true)} disabled={!engine}>
            Dissectors
          </button>
        </div>
      </header>

      <div className="statusbar">
        {!engine && <span>Loading engine…</span>}
        {engine && !fileName && <span>Open a .pcap or .pcapng file — it stays in your browser, nothing is uploaded.</span>}
        {fileName && (
          <span>
            <strong>{fileName}</strong> · {summaries.length} packets
            {filter && ` · ${rows.length} shown`}
          </span>
        )}
      </div>

      <PacketList rows={rows} selected={selected} onSelect={selectPacket} />

      <div className="lower">
        <div className="pane detail-pane">
          <div className="pane-title">Packet details</div>
          <DetailTree
            layers={detail}
            selected={highlight}
            active={activeHighlight}
            onHover={setHover}
            onSelect={(r) => setHighlight(r)}
          />
        </div>
        <div className="pane hex-pane">
          <div className="pane-title">Bytes</div>
          <HexView
            bytes={bytes}
            highlight={activeHighlight}
            onByteSelect={(o) => setHighlight(fieldAtOffset(o))}
            onByteHover={(o) => {
              if (o == null) {
                setHover(null);
                return;
              }
              setHover(fieldAtOffset(o));
            }}
          />
        </div>
      </div>

      {showPosa && engine && (
        <PosaManager
          engine={engine}
          onClose={() => setShowPosa(false)}
          onChange={() => {
            // re-dissect current selection so new decoders take effect
            if (selected != null) {
              setDetail(engine.getDetail(selected));
            }
            setSummaries(engine.getSummaries());
          }}
        />
      )}
    </div>
  );
}
