import { useMemo } from "react";
import { zipSync } from "fflate";
import type { LibpcapngModule } from "../engine";
import { download, formatBytes, safeName } from "../util";

export default function ExportObjects({
  engine,
  proto,
  onClose,
}: {
  engine: LibpcapngModule;
  proto: "http" | "smb";
  onClose: () => void;
}) {
  const objects = useMemo(() => engine.extractObjects(proto), [engine, proto]);

  const downloadZip = () => {
    const files: Record<string, Uint8Array> = {};
    objects.forEach((o, i) => {
      files[safeName(o.filename, o.frame, i)] = o.data;
    });
    download(`${proto}-objects.zip`, zipSync(files, { level: 6 }), "application/zip");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            Export {proto.toUpperCase()} Objects
            <span className="dim" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
              ({objects.length})
            </span>
          </h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="fs-toolbar">
          <button className="btn primary" onClick={downloadZip} disabled={objects.length === 0}>
            Download all as ZIP
          </button>
          <span className="spacer" />
          <span className="dim">Files are carved from reassembled streams — nothing is uploaded.</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Frame</th>
                <th>Hostname</th>
                <th>Content-Type</th>
                <th>Filename</th>
                <th className="num">Size</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {objects.map((o, i) => (
                <tr key={i}>
                  <td className="num">{o.frame}</td>
                  <td>{o.hostname}</td>
                  <td>{o.contentType}</td>
                  <td>{o.filename || <span className="dim">(unnamed)</span>}</td>
                  <td className="num">{formatBytes(o.data.length)}</td>
                  <td>{!o.complete && <span className="badge">partial</span>}</td>
                  <td>
                    <button
                      className="btn small"
                      onClick={() => download(safeName(o.filename, o.frame, i), o.data)}
                    >
                      save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {objects.length === 0 && (
            <div className="pane-empty">No {proto.toUpperCase()} objects found in this capture.</div>
          )}
        </div>
      </div>
    </div>
  );
}
