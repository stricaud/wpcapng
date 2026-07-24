import { useMemo, useState } from "react";
import type { Field, LibpcapngModule } from "../engine";
import { loadStored, saveStored, type StoredPosa } from "../posaStore";

// Prefill proto/port from the selected packet's transport layer.
function analyze(layers: Field[] | null): { proto: "tcp" | "udp"; port: number } {
  let proto: "tcp" | "udp" = "tcp", port = 0;
  const walk = (f: Field) => {
    if (f.abbrev === "tcp") proto = "tcp";
    if (f.abbrev === "udp") proto = "udp";
    if (f.abbrev === "tcp.dstport" || f.abbrev === "udp.dstport") port = Number(f.value) || port;
    f.children.forEach(walk);
  };
  (layers ?? []).forEach(walk);
  return { proto, port };
}

export default function DecodeAsDialog({
  engine,
  index,
  onClose,
  onSaved,
}: {
  engine: LibpcapngModule;
  index: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pre = useMemo(() => (index != null ? analyze(engine.getDetail(index)) : { proto: "tcp" as const, port: 0 }), [engine, index]);
  const protos = useMemo(() => engine.listPosa().map((p) => p.name).sort(), [engine]);

  const [proto, setProto] = useState<"tcp" | "udp">(pre.proto);
  const [port, setPort] = useState(pre.port);
  const [target, setTarget] = useState(protos[0] ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = () => {
    if (!target || port <= 0) return;
    const source = `rule ${proto}.port == ${port} => ${target}\n`;
    const res = engine.loadPosaText(source);
    if (!res.ok) { setMsg({ ok: false, text: res.error || "failed" }); return; }
    const item: StoredPosa = { id: `decode-${proto}-${port}`, name: `Decode ${proto}/${port} as ${target}`, source };
    saveStored([...loadStored().filter((s) => s.id !== item.id), item]);
    setMsg({ ok: true, text: `${proto}.port ${port} now decodes as ${target}.` });
    onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 92vw)" }}>
        <div className="modal-head">
          <h2>Decode As</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="dim" style={{ marginBottom: 10 }}>
          Bind a port to a loaded dissector. Saved in your browser and applied to the whole capture.
        </div>
        <div className="fs-toolbar" style={{ flexWrap: "wrap" }}>
          <select className="sel" value={proto} onChange={(e) => setProto(e.target.value as "tcp" | "udp")}>
            <option value="tcp">tcp.port</option>
            <option value="udp">udp.port</option>
          </select>
          <span className="dim">==</span>
          <input className="text-input compact" style={{ width: 90 }} type="number" placeholder="port" value={port || ""} onChange={(e) => setPort(Number(e.target.value))} />
          <span className="dim">→</span>
          <select className="sel" value={target} onChange={(e) => setTarget(e.target.value)}>
            {protos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {msg && <div className={msg.ok ? "note ok" : "note err"}>{msg.text}</div>}
        <div className="fs-toolbar">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={apply} disabled={!target || port <= 0}>Apply</button>
        </div>
      </div>
    </div>
  );
}
