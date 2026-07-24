import { Fragment, useMemo, useState } from "react";
import { strToU8, zipSync } from "fflate";
import type { LibpcapngModule } from "../engine";
import { download, formatBytes, tryParseJson } from "../util";

export default function CustomBlocks({
  engine,
  onClose,
}: {
  engine: LibpcapngModule;
  onClose: () => void;
}) {
  const blocks = useMemo(() => {
    return engine.getCustomBlocks().map((b, i) => ({ ...b, i, json: tryParseJson(b.data) }));
  }, [engine]);
  const [open, setOpen] = useState<number | null>(null);

  const nameOf = (b: (typeof blocks)[number]) =>
    `${String(b.i).padStart(3, "0")}_pen${b.pen}_frame${b.frame}.${b.json ? "json" : "bin"}`;
  const content = (b: (typeof blocks)[number]): Uint8Array =>
    b.json ? strToU8(b.json.pretty) : b.data;

  const downloadZip = () => {
    const files: Record<string, Uint8Array> = {};
    blocks.forEach((b) => { files[nameOf(b)] = content(b); });
    download("custom-blocks.zip", zipSync(files, { level: 6 }), "application/zip");
  };

  const jsonCount = blocks.filter((b) => b.json).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Custom Blocks <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>({blocks.length}, {jsonCount} JSON)</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <button className="btn primary" onClick={downloadZip} disabled={blocks.length === 0}>
            Download all as ZIP
          </button>
          <span className="spacer" />
          <span className="dim">JSON payloads are pretty-printed and saved as .json; others as .bin.</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th className="num">Frame</th><th className="num">PEN</th><th className="num">Size</th><th>Type</th><th></th></tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <Fragment key={b.i}>
                  <tr style={{ cursor: b.json ? "pointer" : "default" }} onClick={() => b.json && setOpen(open === b.i ? null : b.i)}>
                    <td className="num">{b.frame}</td>
                    <td className="num">{b.pen}</td>
                    <td className="num">{formatBytes(b.size)}</td>
                    <td>{b.json ? <span className="badge" style={{ background: "#14322a", color: "#8fe3c0" }}>JSON</span> : <span className="dim">binary</span>}</td>
                    <td><button className="btn small" onClick={(e) => { e.stopPropagation(); download(nameOf(b), content(b)); }}>save</button></td>
                  </tr>
                  {open === b.i && b.json && (
                    <tr><td colSpan={5}><pre className="json-view" style={{ maxHeight: 300 }}>{b.json.pretty}</pre></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {blocks.length === 0 && <div className="pane-empty">No custom blocks in this capture.</div>}
        </div>
      </div>
    </div>
  );
}
