import { useState } from "react";
import type { LibpcapngModule, PosaInfo } from "../engine";
import { type StoredPosa, loadStored, saveStored } from "../posaStore";
import { download, pickTextFile } from "../util";

const EXAMPLE = `# Example declarative (posa) dissector.
# See libpcapng's posa docs for the full syntax.
Object myproto {
  col "MYPROTO"
  abbrev "myproto"
  uint8  version  label "Version"
  uint16 length   label "Length"
}`;

export default function PosaManager({
  engine,
  onChange,
  onClose,
}: {
  engine: LibpcapngModule;
  onChange: () => void; // re-dissect after decoder set changes
  onClose: () => void;
}) {
  const [stored, setStored] = useState<StoredPosa[]>(loadStored());
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const loaded: PosaInfo[] = engine.listPosa();

  function add() {
    const res = engine.loadPosaText(source);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error || "parse error" });
      return;
    }
    const item: StoredPosa = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || `decoder ${stored.length + 1}`,
      source,
    };
    const next = [...stored, item];
    setStored(next);
    saveStored(next);
    setName("");
    setSource("");
    setMsg({ ok: true, text: `Loaded ${res.added} protocol(s).` });
    onChange();
  }

  async function importFile() {
    const text = await pickTextFile("application/json,.json");
    if (!text) return;
    try {
      const items = JSON.parse(text) as StoredPosa[];
      if (!Array.isArray(items)) return;
      const byId = new Map(stored.map((s) => [s.id, s]));
      let loaded = 0;
      for (const it of items) {
        if (!it.source) continue;
        const res = engine.loadPosaText(it.source);
        if (res.ok) loaded++;
        byId.set(it.id ?? `${Date.now()}-${loaded}`, it);
      }
      const next = [...byId.values()];
      setStored(next);
      saveStored(next);
      setMsg({ ok: true, text: `Imported ${items.length}, loaded ${loaded}.` });
      onChange();
    } catch {
      setMsg({ ok: false, text: "Invalid dissector file." });
    }
  }

  function remove(id: string) {
    const next = stored.filter((s) => s.id !== id);
    setStored(next);
    saveStored(next);
    // Removed decoders stay in the engine until reload; note that to the user.
    setMsg({ ok: true, text: "Removed. Reload the page to fully unload it from the engine." });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Dissectors</h2>
          <button className="btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="fs-toolbar">
          <button
            className="btn"
            disabled={stored.length === 0}
            onClick={() => download("dissectors.json", JSON.stringify(stored, null, 2), "application/json")}
          >
            Export all
          </button>
          <button className="btn" onClick={importFile}>Import…</button>
        </div>

        <section>
          <h3>Loaded in engine ({loaded.length})</h3>
          <div className="chip-row">
            {loaded.map((p) => (
              <span className="chip" key={p.name} title={p.abbrev}>
                {p.display || p.name}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3>Your saved decoders ({stored.length})</h3>
          {stored.length === 0 && <p className="dim">None yet. Add one below — it persists in your browser.</p>}
          <ul className="stored-list">
            {stored.map((s) => (
              <li key={s.id}>
                <span>{s.name}</span>
                <button className="btn small" onClick={() => remove(s.id)}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Add a decoder (.posa)</h3>
          <input
            className="text-input"
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="posa-src"
            placeholder={EXAMPLE}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
          />
          {msg && <div className={msg.ok ? "note ok" : "note err"}>{msg.text}</div>}
          <button className="btn primary" onClick={add} disabled={!source.trim()}>
            Load &amp; save
          </button>
        </section>
      </div>
    </div>
  );
}
