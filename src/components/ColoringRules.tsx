import { useState } from "react";
import type { LibpcapngModule } from "../engine";
import { DEFAULT_RULES, saveColorRules, type ColorRule } from "../coloring";
import { download, pickTextFile } from "../util";

let nextId = 1000;

export default function ColoringRules({
  engine,
  rules,
  onChange,
  onClose,
}: {
  engine: LibpcapngModule;
  rules: ColorRule[];
  onChange: (rules: ColorRule[]) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<ColorRule[]>(rules);

  const commit = (next: ColorRule[]) => {
    setLocal(next);
    saveColorRules(next);
    onChange(next);
  };

  const update = (id: number, patch: Partial<ColorRule>) =>
    commit(local.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= local.length) return;
    const next = [...local];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const validErr = (f: string) => {
    if (!f.trim()) return null;
    const res = engine.validateFilter(f);
    return res.ok ? null : res.error;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Coloring Rules</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>
          The first matching rule (top to bottom) colors the packet. Saved in your browser.
        </div>

        <table className="io-rows">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Display filter</th>
              <th>Text</th>
              <th>Background</th>
              <th>Order</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {local.map((r, i) => {
              const err = validErr(r.filter);
              return (
                <tr key={r.id} style={{ background: r.bg, color: r.fg }}>
                  <td>
                    <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} />
                  </td>
                  <td>
                    <input className="text-input compact" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      className={`text-input compact mono${err ? " invalid" : ""}`}
                      value={r.filter}
                      title={err ?? ""}
                      onChange={(e) => update(r.id, { filter: e.target.value })}
                    />
                  </td>
                  <td><input type="color" value={r.fg} onChange={(e) => update(r.id, { fg: e.target.value })} /></td>
                  <td><input type="color" value={r.bg} onChange={(e) => update(r.id, { bg: e.target.value })} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>{" "}
                    <button className="btn small" onClick={() => move(i, 1)} disabled={i === local.length - 1}>↓</button>
                  </td>
                  <td>
                    <button className="btn small" onClick={() => commit(local.filter((x) => x.id !== r.id))}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="fs-toolbar">
          <button className="btn" onClick={() => commit([...local, { id: nextId++, name: "New", filter: "", fg: "#ffffff", bg: "#333333", enabled: true }])}>
            + Add rule
          </button>
          <button className="btn" onClick={() => commit(DEFAULT_RULES.map((r) => ({ ...r })))}>Reset to defaults</button>
          <button className="btn" onClick={() => download("coloring-rules.json", JSON.stringify(local, null, 2), "application/json")}>Export</button>
          <button
            className="btn"
            onClick={async () => {
              const text = await pickTextFile("application/json,.json");
              if (!text) return;
              try {
                const arr = JSON.parse(text) as ColorRule[];
                if (Array.isArray(arr)) commit(arr.map((r, i) => ({ ...r, id: r.id ?? i + 1 })));
              } catch {
                /* ignore malformed */
              }
            }}
          >
            Import
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
