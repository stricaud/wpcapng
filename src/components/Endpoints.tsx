import { useMemo, useState } from "react";
import type { Endpoint, LibpcapngModule } from "../engine";
import { formatBytes } from "../util";

type SortKey = "address" | "packets" | "bytes" | "txBytes" | "rxBytes";

export default function Endpoints({
  engine,
  onClose,
}: {
  engine: LibpcapngModule;
  onClose: () => void;
}) {
  const [sort, setSort] = useState<SortKey>("bytes");
  const eps = useMemo(() => engine.getEndpoints(), [engine]);
  const rows = useMemo(() => {
    const copy = [...eps];
    copy.sort((a, b) => (sort === "address" ? a.address.localeCompare(b.address) : (b[sort] as number) - (a[sort] as number)));
    return copy;
  }, [eps, sort]);

  const th = (key: SortKey, label: string, num = false) => (
    <th className={num ? "num" : ""} style={{ cursor: "pointer" }} onClick={() => setSort(key)}>
      {label}{sort === key ? " ▾" : ""}
    </th>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Endpoints <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>({eps.length})</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {th("address", "Address")}
                {th("packets", "Packets", true)}
                {th("bytes", "Bytes", true)}
                {th("txPackets" as SortKey, "Tx Pkts", true)}
                {th("txBytes", "Tx Bytes", true)}
                {th("rxPackets" as SortKey, "Rx Pkts", true)}
                {th("rxBytes", "Rx Bytes", true)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e: Endpoint) => (
                <tr key={e.address}>
                  <td>{e.address}</td>
                  <td className="num">{e.packets}</td>
                  <td className="num">{formatBytes(e.bytes)}</td>
                  <td className="num">{e.txPackets}</td>
                  <td className="num">{formatBytes(e.txBytes)}</td>
                  <td className="num">{e.rxPackets}</td>
                  <td className="num">{formatBytes(e.rxBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {eps.length === 0 && <div className="pane-empty">No IP endpoints</div>}
        </div>
      </div>
    </div>
  );
}
