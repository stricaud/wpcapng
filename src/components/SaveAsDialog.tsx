import { useState } from "react";
import type { LibpcapngModule } from "../engine";
import { download } from "../util";

type Scope = "all" | "displayed" | "marked" | "selected";

export default function SaveAsDialog({
  engine,
  total,
  displayed,
  marked,
  selected,
  onClose,
}: {
  engine: LibpcapngModule;
  total: number;
  displayed: number[];
  marked: number[];
  selected: number | null;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("displayed");
  const [name, setName] = useState("capture.pcapng");

  const indicesFor = (s: Scope): number[] => {
    if (s === "all") return Array.from({ length: total }, (_, i) => i);
    if (s === "displayed") return displayed;
    if (s === "marked") return marked;
    return selected != null ? [selected] : [];
  };

  const opts: { key: Scope; label: string; count: number; disabled: boolean }[] = [
    { key: "all", label: "All packets", count: total, disabled: total === 0 },
    { key: "displayed", label: "Displayed (current filter)", count: displayed.length, disabled: displayed.length === 0 },
    { key: "marked", label: "Marked packets", count: marked.length, disabled: marked.length === 0 },
    { key: "selected", label: "Selected packet", count: selected != null ? 1 : 0, disabled: selected == null },
  ];

  const save = () => {
    const idx = indicesFor(scope);
    if (idx.length === 0) return;
    const out = engine.exportPcapng(idx);
    download(name.trim() || "capture.pcapng", out, "application/vnd.tcpdump.pcap");
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 94vw)" }}>
        <div className="modal-head">
          <h2>Save As / Export</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <h3>Packets to export</h3>
        <div className="radio-list">
          {opts.map((o) => (
            <label key={o.key} className={o.disabled ? "dim" : ""}>
              <input
                type="radio"
                name="scope"
                checked={scope === o.key}
                disabled={o.disabled}
                onChange={() => setScope(o.key)}
              />
              {o.label} <span className="dim">({o.count})</span>
            </label>
          ))}
        </div>

        <h3>Filename</h3>
        <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="fs-toolbar">
          <span className="dim">Exports a standard pcapng — opens in Wireshark.</span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={indicesFor(scope).length === 0}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
