import type { Summary } from "../engine";

// Subtle protocol-based row tint, à la Wireshark coloring rules.
function protoClass(proto: string): string {
  const p = proto.toUpperCase();
  if (p === "TCP") return "row-tcp";
  if (p === "UDP") return "row-udp";
  if (p === "DNS") return "row-dns";
  if (p === "ICMP" || p === "ICMPV6") return "row-icmp";
  if (p.startsWith("TLS") || p === "SSL") return "row-tls";
  if (p === "HTTP" || p === "HTTP2") return "row-http";
  if (p === "ARP") return "row-arp";
  return "";
}

export default function PacketList({
  rows,
  selected,
  onSelect,
}: {
  rows: { idx: number; s: Summary }[];
  selected: number | null;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="packet-list">
      <table>
        <thead>
          <tr>
            <th className="c-no">No.</th>
            <th className="c-time">Time</th>
            <th className="c-addr">Source</th>
            <th className="c-addr">Destination</th>
            <th className="c-proto">Protocol</th>
            <th className="c-len">Length</th>
            <th className="c-info">Info</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ idx, s }) => (
            <tr
              key={idx}
              className={`${protoClass(s.proto)}${selected === idx ? " selected" : ""}`}
              onClick={() => onSelect(idx)}
            >
              <td className="c-no">{s.no}</td>
              <td className="c-time">{s.time.toFixed(6)}</td>
              <td className="c-addr">{s.src}</td>
              <td className="c-addr">{s.dst}</td>
              <td className="c-proto">{s.proto}</td>
              <td className="c-len">{s.length}</td>
              <td className="c-info">{s.info}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="pane-empty">No packets</div>}
    </div>
  );
}
