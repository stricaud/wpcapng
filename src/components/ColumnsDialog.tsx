import { COLUMN_BY_KEY, saveCols, type ColConfig } from "../columns";

export default function ColumnsDialog({
  cols,
  onChange,
  onClose,
}: {
  cols: ColConfig[];
  onChange: (c: ColConfig[]) => void;
  onClose: () => void;
}) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, 92vw)" }}>
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
                <td style={{ width: "100%" }}>{COLUMN_BY_KEY.get(c.key)?.label ?? c.key}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>{" "}
                  <button className="btn small" onClick={() => move(i, 1)} disabled={i === cols.length - 1}>↓</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fs-toolbar">
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
