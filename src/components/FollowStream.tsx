import { useEffect, useMemo, useState } from "react";
import type { LibpcapngModule } from "../engine";
import { download, formatBytes, toHexDump, toText } from "../util";
import { decryptTls, type DecryptResult, type KeyLog } from "../tls13";

type ViewMode = "ascii" | "hex";
type DirFilter = "both" | "client" | "server";

export default function FollowStream({
  engine,
  index,
  keylog,
  onClose,
}: {
  engine: LibpcapngModule;
  index: number;
  keylog: KeyLog | null;
  onClose: () => void;
}) {
  const stream = useMemo(() => engine.getStream(index), [engine, index]);
  const [view, setView] = useState<ViewMode>("ascii");
  const [dir, setDir] = useState<DirFilter>("both");
  const [decrypt, setDecrypt] = useState(false);
  const [dec, setDec] = useState<DecryptResult | null>(null);
  const [decBusy, setDecBusy] = useState(false);

  useEffect(() => {
    if (!decrypt || !keylog || !stream || !stream.ok) { setDec(null); return; }
    let cancel = false;
    setDecBusy(true);
    decryptTls(stream.client, stream.server, keylog)
      .then((r) => { if (!cancel) setDec(r); })
      .finally(() => { if (!cancel) setDecBusy(false); });
    return () => { cancel = true; };
  }, [decrypt, keylog, stream]);

  if (!stream || !stream.ok) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2>Follow Stream</h2>
            <button className="btn" onClick={onClose}>✕</button>
          </div>
          <p className="dim">This packet is not part of a TCP or UDP conversation.</p>
        </div>
      </div>
    );
  }

  const rawSegs = decrypt && dec?.ok
    ? [{ dir: 0 as const, data: dec.client ?? new Uint8Array() }, { dir: 1 as const, data: dec.server ?? new Uint8Array() }]
    : stream.segments;
  const segs = rawSegs.filter(
    (s) => dir === "both" || (dir === "client" ? s.dir === 0 : s.dir === 1),
  );

  const render = (data: Uint8Array) => (view === "hex" ? toHexDump(data) : toText(data));

  const saveAll = () => {
    // concatenate the filtered segments in order
    const total = segs.reduce((n, s) => n + s.data.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const s of segs) {
      buf.set(s.data, o);
      o += s.data.length;
    }
    download(`stream-${index + 1}.${view === "hex" ? "txt" : "raw"}`, view === "hex" ? toHexDump(buf) : buf);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            Follow {stream.proto} Stream
            <span className="dim" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
              {stream.clientIp}:{stream.clientPort} ↔ {stream.serverIp}:{stream.serverPort}
            </span>
          </h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="fs-toolbar">
          <span className="legend">
            <span className="sw dir0" /> client → server ({formatBytes(stream.client.length)})
            <span className="sw dir1" /> server → client ({formatBytes(stream.server.length)})
            <span className="dim">· {stream.packets} packets</span>
          </span>
          <span className="spacer" />
          <select value={dir} onChange={(e) => setDir(e.target.value as DirFilter)} className="sel">
            <option value="both">Entire conversation</option>
            <option value="client">Client → Server</option>
            <option value="server">Server → Client</option>
          </select>
          <select value={view} onChange={(e) => setView(e.target.value as ViewMode)} className="sel">
            <option value="ascii">ASCII</option>
            <option value="hex">Hex dump</option>
          </select>
          <label className="dim" style={{ display: "flex", alignItems: "center", gap: 4 }} title={keylog ? "Decrypt with the loaded TLS key log" : "Load a TLS key log first (File ▸ Load TLS key log…)"}>
            <input type="checkbox" checked={decrypt} disabled={!keylog} onChange={(e) => setDecrypt(e.target.checked)} />
            Decrypt TLS
          </label>
          <button className="btn" onClick={saveAll}>Save as…</button>
        </div>
        {decrypt && (
          <div className={dec && !dec.ok ? "note err" : "note ok"} style={{ margin: "0 0 8px" }}>
            {decBusy ? "Decrypting…" : dec?.ok ? `Decrypted (${dec.cipher})` : dec?.error ?? "…"}
          </div>
        )}

        <pre className="fs-body">
          {segs.map((s, i) => (
            <span key={i} className={s.dir === 0 ? "dir0" : "dir1"}>
              {render(s.data)}
              {view === "hex" ? "\n" : ""}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}
