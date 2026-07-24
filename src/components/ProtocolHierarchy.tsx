import { useMemo } from "react";
import type { HierarchyNode, LibpcapngModule } from "../engine";
import { formatBytes } from "../util";

function Row({ node, depth, total }: { node: HierarchyNode; depth: number; total: number }) {
  const pct = total > 0 ? (node.packets / total) * 100 : 0;
  return (
    <>
      <tr>
        <td style={{ paddingLeft: depth * 18 + 8 }}>{node.name || node.abbrev}</td>
        <td className="num">{pct.toFixed(1)}%</td>
        <td className="num">{node.packets}</td>
        <td className="num">{formatBytes(node.bytes)}</td>
      </tr>
      {node.children.map((c, i) => (
        <Row key={c.abbrev + i} node={c} depth={depth + 1} total={total} />
      ))}
    </>
  );
}

export default function ProtocolHierarchy({
  engine,
  total,
  onClose,
}: {
  engine: LibpcapngModule;
  total: number;
  onClose: () => void;
}) {
  const tree = useMemo(() => engine.getProtocolHierarchy(), [engine]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Protocol Hierarchy</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th className="num">% Packets</th>
                <th className="num">Packets</th>
                <th className="num">Bytes</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((n, i) => (
                <Row key={n.abbrev + i} node={n} depth={0} total={total} />
              ))}
            </tbody>
          </table>
          {tree.length === 0 && <div className="pane-empty">No packets</div>}
        </div>
      </div>
    </div>
  );
}
