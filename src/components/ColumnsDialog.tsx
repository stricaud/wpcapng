import { useState } from "react";
import { colLabel, saveCols, type ColConfig } from "../columns";

export default function ColumnsDialog({
  cols,
  onChange,
  onClose,
}: {
  cols: ColConfig[];
  onChange: (c: ColConfig[]) => void;
  onClose: () => void;
}) {
  const [abbrev, setAbbrev] = useState("");
  const [label, setLabel] = useState("");

  const commit = (next: ColConfig[]) => {
    onChange(next);
    saveCols(next);
  };
  const toggle = (key: string) => commit(cols.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const addCustom = () => {
    const ab = abbrev.trim();
    if (!ab) return;
    const key = `custom:${ab}`;
    if (cols.some((c) => c.key === key)) return;
    commit([...cols, { key, visible: true, abbrev: ab, label: label.trim() || ab }]);
    setAbbrev("");
    setLabel("");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 92vw)" }}>
        <div className="modal-head">
          <h2>Columns</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>Toggle visibility and reorder. Saved in your browser.</div>
        <table className="io-rows">
          <tbody>
            {cols.map((c, i) => (
              <tr key={c.key}>
                <td><input type="checkbox" checked={c.visible} onChange={() => toggle(c.key)} /></td>
                <td style={{ width: "100%" }}>
                  {colLabel(c)}
                  {c.key.startsWith("custom:") && <span className="dim mono"> · {c.abbrev}</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>{" "}
                  <button className="btn small" onClick={() => move(i, 1)} disabled={i === cols.length - 1}>↓</button>
                  {c.key.startsWith("custom:") && (
                    <>{" "}<button className="btn small" onClick={() => commit(cols.filter((x) => x.key !== c.key))}>✕</button></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Add custom column</h3>
        <div className="fs-toolbar">
          <input className="text-input compact mono" style={{ width: 180 }} placeholder="field abbrev, e.g. dns.qry.name" value={abbrev} onChange={(e) => setAbbrev(e.target.value)} />
          <input className="text-input compact" style={{ width: 130 }} placeholder="title (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn" onClick={addCustom} disabled={!abbrev.trim()}>+ Add</button>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
