import type { FindParams } from "../find";

export default function FindDialog({
  params,
  setParams,
  onFind,
  onClose,
  status,
}: {
  params: FindParams;
  setParams: (p: FindParams) => void;
  onFind: (dir: 1 | -1) => void;
  onClose: () => void;
  status: string | null;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 94vw)" }}>
        <div className="modal-head">
          <h2>Find Packet</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="find-grid">
          <label>Search by</label>
          <select className="sel" value={params.type} onChange={(e) => setParams({ ...params, type: e.target.value as FindParams["type"] })}>
            <option value="filter">Display filter</option>
            <option value="string">String</option>
            <option value="hex">Hex value</option>
          </select>

          <label>In</label>
          <select
            className="sel"
            value={params.scope}
            disabled={params.type === "filter"}
            onChange={(e) => setParams({ ...params, scope: e.target.value as FindParams["scope"] })}
          >
            <option value="info">Packet list (Info)</option>
            <option value="bytes">Packet bytes</option>
          </select>

          <label>{params.type === "hex" ? "Hex bytes" : params.type === "filter" ? "Filter" : "String"}</label>
          <input
            className="text-input mono"
            autoFocus
            placeholder={
              params.type === "hex" ? "e.g. 47 45 54 or 474554" : params.type === "filter" ? "e.g. http.request" : "e.g. GET /"
            }
            value={params.text}
            onChange={(e) => setParams({ ...params, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFind(e.shiftKey ? -1 : 1);
            }}
          />
        </div>

        <div className="fs-toolbar">
          {params.type === "string" && (
            <label className="dim" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={params.caseSensitive} onChange={(e) => setParams({ ...params, caseSensitive: e.target.checked })} />
              Case sensitive
            </label>
          )}
          <span className="spacer" />
          {status && <span className="dim">{status}</span>}
          <button className="btn" onClick={() => onFind(-1)} disabled={!params.text.trim()}>Find Previous</button>
          <button className="btn primary" onClick={() => onFind(1)} disabled={!params.text.trim()}>Find Next</button>
        </div>
      </div>
    </div>
  );
}
