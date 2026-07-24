import { useMemo } from "react";
import { zipSync } from "fflate";
import type { LibpcapngModule } from "../engine";
import { download, formatBytes } from "../util";

const nameOf = (b: { frame: number; pen: number }, i: number) =>
  `${String(i).padStart(3, "0")}_pen${b.pen}_frame${b.frame}.bin`;

export default function CustomBlocks({
  engine,
  onClose,
}: {
  engine: LibpcapngModule;
  onClose: () => void;
}) {
  const blocks = useMemo(() => engine.getCustomBlocks(), [engine]);

  const downloadZip = () => {
    const files: Record<string, Uint8Array> = {};
    blocks.forEach((b, i) => { files[nameOf(b, i)] = b.data; });
    download("custom-blocks.zip", zipSync(files, { level: 6 }), "application/zip");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Custom Blocks <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>({blocks.length})</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="fs-toolbar">
          <button className="btn primary" onClick={downloadZip} disabled={blocks.length === 0}>
            Download all as ZIP
          </button>
          <span className="spacer" />
          <span className="dim">pcapng Custom Blocks — the raw per-block payload after the PEN.</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th className="num">Frame</th><th className="num">PEN</th><th className="num">Size</th><th></th></tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <tr key={i}>
                  <td className="num">{b.frame}</td>
                  <td className="num">{b.pen}</td>
                  <td className="num">{formatBytes(b.size)}</td>
                  <td><button className="btn small" onClick={() => download(nameOf(b, i), b.data)}>save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {blocks.length === 0 && <div className="pane-empty">No custom blocks in this capture.</div>}
        </div>
      </div>
    </div>
  );
}
