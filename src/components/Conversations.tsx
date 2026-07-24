import { useMemo } from "react";
import type { LibpcapngModule } from "../engine";
import { formatBytes } from "../util";

export default function Conversations({
  engine,
  onFollow,
  onClose,
}: {
  engine: LibpcapngModule;
  onFollow: (packetIndex: number) => void;
  onClose: () => void;
}) {
  const convs = useMemo(
    () => engine.getConversations().sort((a, b) => b.bytes - a.bytes),
    [engine],
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Conversations <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>({convs.length})</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Proto</th>
                <th>Address A</th>
                <th>Port A</th>
                <th>Address B</th>
                <th>Port B</th>
                <th className="num">Packets</th>
                <th className="num">Bytes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {convs.map((c) => (
                <tr key={c.id}>
                  <td>{c.proto}</td>
                  <td>{c.addrA}</td>
                  <td className="num">{c.portA}</td>
                  <td>{c.addrB}</td>
                  <td className="num">{c.portB}</td>
                  <td className="num">{c.packets}</td>
                  <td className="num">{formatBytes(c.bytes)}</td>
                  <td>
                    <button className="btn small" onClick={() => onFollow(c.id)}>Follow</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {convs.length === 0 && <div className="pane-empty">No TCP/UDP conversations</div>}
        </div>
      </div>
    </div>
  );
}
