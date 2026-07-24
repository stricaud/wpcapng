import { Suspense, lazy, useEffect, useMemo, useRef, useState, type DragEvent as RDrag } from "react";
import { getEngine, type Field, type LibpcapngModule, type Summary } from "./engine";
import { applyStored, loadStored } from "./posaStore";
import { defaultFindParams, findPacket, type FindParams } from "./find";
import { computeRowColors, loadColorRules, type ColorRule } from "./coloring";
import PacketList from "./components/PacketList";
import DetailTree from "./components/DetailTree";
import HexView from "./components/HexView";
import Menu from "./components/Menu";

// Heavy / on-demand overlays are code-split so ECharts + fflate load lazily.
const PosaManager = lazy(() => import("./components/PosaManager"));
const FollowStream = lazy(() => import("./components/FollowStream"));
const IOGraph = lazy(() => import("./components/IOGraph"));
const Conversations = lazy(() => import("./components/Conversations"));
const ExportObjects = lazy(() => import("./components/ExportObjects"));
const FindDialog = lazy(() => import("./components/FindDialog"));
const SaveAsDialog = lazy(() => import("./components/SaveAsDialog"));
const GoToDialog = lazy(() => import("./components/GoToDialog"));
const Endpoints = lazy(() => import("./components/Endpoints"));
const EntityExplorer = lazy(() => import("./components/EntityExplorer"));
const ProtocolHierarchy = lazy(() => import("./components/ProtocolHierarchy"));
const ColoringRules = lazy(() => import("./components/ColoringRules"));
const DissectorBuilder = lazy(() => import("./components/DissectorBuilder"));

type Overlay =
  | { kind: "follow"; index: number }
  | { kind: "iograph" }
  | { kind: "conversations" }
  | { kind: "endpoints" }
  | { kind: "entities" }
  | { kind: "hierarchy" }
  | { kind: "coloring" }
  | { kind: "objects"; proto: "http" | "smb" }
  | { kind: "posa" }
  | { kind: "builder"; index: number }
  | { kind: "find" }
  | { kind: "goto" }
  | { kind: "saveas" }
  | null;

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
  const [appliedFilter, setAppliedFilter] = useState("");
  const [filterErr, setFilterErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [dragActive, setDragActive] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [findParams, setFindParams] = useState<FindParams>(defaultFindParams);
  const [findStatus, setFindStatus] = useState<string | null>(null);
  const [colorRules, setColorRules] = useState<ColorRule[]>(loadColorRules());
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasCapture = summaries.length > 0;

  function toggleMark(idx: number) {
    setMarked((m) => {
      const n = new Set(m);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  }

  const hasFiles = (e: RDrag) => e.dataTransfer.types.includes("Files");

  function onDragEnter(e: RDrag) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }
  function onDragOver(e: RDrag) {
    if (hasFiles(e)) e.preventDefault(); // allow drop
  }
  function onDragLeave(e: RDrag) {
    if (!hasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }
  function onDrop(e: RDrag) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) openFile(f);
  }

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
      setFilter("");
      setAppliedFilter("");
      setFilterErr(null);
      setMarked(new Set());
      setFindStatus(null);
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

  // Wireshark-style display filter, applied on Enter (each eval dissects every
  // packet, so we don't run it on every keystroke).
  const rows = useMemo(() => {
    const all = summaries.map((s, idx) => ({ idx, s }));
    if (!engine || !appliedFilter.trim()) return all;
    const mask = engine.matchFilter(appliedFilter);
    return all.filter(({ idx }) => mask[idx]);
  }, [summaries, appliedFilter, engine]);

  const activeHighlight = hover ?? highlight;

  // Per-packet coloring from the coloring rules (first match wins).
  const rowColors = useMemo(
    () => (engine ? computeRowColors(engine, colorRules, summaries.length) : []),
    [engine, colorRules, summaries],
  );

  function runFind(dir: 1 | -1) {
    if (!engine) return;
    const list = rows.map((r) => r.idx);
    const found = findPacket(engine, summaries, list, selected, findParams, dir);
    if (found == null) setFindStatus("No match");
    else {
      setFindStatus(null);
      selectPacket(found);
    }
  }

  function goToPacket(no: number) {
    const idx = no - 1;
    if (idx < 0 || idx >= summaries.length) return;
    if (!rows.some((r) => r.idx === idx)) {
      // reveal it if the current filter hides it
      setFilter("");
      setAppliedFilter("");
    }
    selectPacket(idx);
  }

  // Keyboard shortcuts (Wireshark-ish).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!engine) return;
      if (meta && e.key.toLowerCase() === "f") { e.preventDefault(); setOverlay({ kind: "find" }); }
      else if (e.key === "F3") { e.preventDefault(); runFind(e.shiftKey ? -1 : 1); }
      else if (meta && e.key.toLowerCase() === "g") { e.preventDefault(); setOverlay({ kind: "goto" }); }
      else if (meta && e.key.toLowerCase() === "m") { e.preventDefault(); if (selected != null) toggleMark(selected); }
      else if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); if (hasCapture) setOverlay({ kind: "saveas" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, rows, selected, findParams, summaries, hasCapture]);

  return (
    <div
      className="app"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragActive && (
        <div className="drop-overlay">
          <div className="drop-box">
            <div className="drop-icon">🦈</div>
            <div>Drop a <strong>.pcap</strong> / <strong>.pcapng</strong> to open</div>
            <div className="dim">It stays in your browser — nothing is uploaded.</div>
          </div>
        </div>
      )}
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
            className={`filter-input${filterErr ? " invalid" : ""}`}
            placeholder="Display filter — e.g. tcp.port == 443 && ip.addr == 10.0.0.1   (Enter to apply)"
            value={filter}
            onChange={(e) => {
              const v = e.target.value;
              setFilter(v);
              if (!engine || !v.trim()) {
                setFilterErr(null);
                if (!v.trim()) setAppliedFilter("");
                return;
              }
              const res = engine.validateFilter(v);
              setFilterErr(res.ok ? null : res.error);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !filterErr) setAppliedFilter(filter);
            }}
            disabled={summaries.length === 0}
            title={filterErr ?? "Press Enter to apply"}
            spellCheck={false}
          />
          <button
            className="btn"
            disabled={selected == null}
            onClick={() => selected != null && setOverlay({ kind: "follow", index: selected })}
          >
            Follow Stream
          </button>
          <Menu
            label="File"
            items={[
              { label: "Open capture…", onClick: () => fileInput.current?.click(), disabled: !engine },
              { label: "Save as / Export…  ⌘S", onClick: () => setOverlay({ kind: "saveas" }), disabled: !hasCapture },
            ]}
          />
          <Menu
            label="Edit"
            items={[
              { label: "Find…  ⌘F", onClick: () => setOverlay({ kind: "find" }), disabled: !hasCapture },
              { label: "Find Next  F3", onClick: () => runFind(1), disabled: !hasCapture },
              { label: "Find Previous  ⇧F3", onClick: () => runFind(-1), disabled: !hasCapture },
              {
                label: selected != null && marked.has(selected) ? "Unmark Packet  ⌘M" : "Mark Packet  ⌘M",
                onClick: () => selected != null && toggleMark(selected),
                disabled: selected == null,
              },
              { label: "Unmark All", onClick: () => setMarked(new Set()), disabled: marked.size === 0 },
              { label: "Go to Packet…  ⌘G", onClick: () => setOverlay({ kind: "goto" }), disabled: !hasCapture },
            ]}
          />
          <Menu
            label="Statistics"
            items={[
              { label: "IO Graph", onClick: () => setOverlay({ kind: "iograph" }), disabled: !hasCapture },
              { label: "Conversations", onClick: () => setOverlay({ kind: "conversations" }), disabled: !hasCapture },
              { label: "Endpoints", onClick: () => setOverlay({ kind: "endpoints" }), disabled: !hasCapture },
              { label: "Protocol Hierarchy", onClick: () => setOverlay({ kind: "hierarchy" }), disabled: !hasCapture },
              { label: "Entity Explorer", onClick: () => setOverlay({ kind: "entities" }), disabled: !hasCapture },
            ]}
          />
          <Menu
            label="View"
            items={[
              { label: "Coloring Rules…", onClick: () => setOverlay({ kind: "coloring" }), disabled: !engine },
            ]}
          />
          <Menu
            label="Export"
            items={[
              { label: "HTTP Objects…", onClick: () => setOverlay({ kind: "objects", proto: "http" }), disabled: !hasCapture },
              { label: "SMB Objects…", onClick: () => setOverlay({ kind: "objects", proto: "smb" }), disabled: !hasCapture },
            ]}
          />
          <Menu
            label="Tools"
            items={[
              {
                label: "Build Dissector from selected…",
                onClick: () => selected != null && setOverlay({ kind: "builder", index: selected }),
                disabled: selected == null,
              },
              { label: "Manage Dissectors…", onClick: () => setOverlay({ kind: "posa" }), disabled: !engine },
            ]}
          />
        </div>
      </header>

      <div className="statusbar">
        {!engine && <span>Loading engine…</span>}
        {engine && !fileName && <span>Open a .pcap or .pcapng file — it stays in your browser, nothing is uploaded.</span>}
        {fileName && (
          <span>
            <strong>{fileName}</strong> · {summaries.length} packets
            {appliedFilter && ` · ${rows.length} shown`}
            {marked.size > 0 && ` · ${marked.size} marked`}
            {findStatus && ` · ${findStatus}`}
          </span>
        )}
      </div>

      <PacketList rows={rows} selected={selected} marked={marked} colors={rowColors} onSelect={selectPacket} />

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

      <Suspense fallback={null}>
        {engine && overlay?.kind === "posa" && (
          <PosaManager
            engine={engine}
            onClose={() => setOverlay(null)}
            onChange={() => {
              if (selected != null) setDetail(engine.getDetail(selected));
              setSummaries(engine.getSummaries());
            }}
          />
        )}
        {engine && overlay?.kind === "follow" && (
          <FollowStream engine={engine} index={overlay.index} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "iograph" && (
          <IOGraph engine={engine} summaries={summaries} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "conversations" && (
          <Conversations
            engine={engine}
            onClose={() => setOverlay(null)}
            onFollow={(idx) => setOverlay({ kind: "follow", index: idx })}
          />
        )}
        {engine && overlay?.kind === "endpoints" && (
          <Endpoints engine={engine} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "entities" && (
          <EntityExplorer engine={engine} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "hierarchy" && (
          <ProtocolHierarchy engine={engine} total={summaries.length} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "coloring" && (
          <ColoringRules engine={engine} rules={colorRules} onChange={setColorRules} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "builder" && (
          <DissectorBuilder
            engine={engine}
            index={overlay.index}
            onClose={() => setOverlay(null)}
            onSaved={() => {
              if (selected != null) setDetail(engine.getDetail(selected));
              setSummaries(engine.getSummaries());
            }}
          />
        )}
        {engine && overlay?.kind === "objects" && (
          <ExportObjects engine={engine} proto={overlay.proto} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "find" && (
          <FindDialog
            params={findParams}
            setParams={setFindParams}
            onFind={runFind}
            onClose={() => setOverlay(null)}
            status={findStatus}
          />
        )}
        {engine && overlay?.kind === "goto" && (
          <GoToDialog max={summaries.length} onGo={goToPacket} onClose={() => setOverlay(null)} />
        )}
        {engine && overlay?.kind === "saveas" && (
          <SaveAsDialog
            engine={engine}
            total={summaries.length}
            displayed={rows.map((r) => r.idx)}
            marked={[...marked].sort((a, b) => a - b)}
            selected={selected}
            onClose={() => setOverlay(null)}
          />
        )}
      </Suspense>
    </div>
  );
}
