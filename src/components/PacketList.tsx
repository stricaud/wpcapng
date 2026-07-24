import { useEffect, useRef } from "react";
import type { Summary } from "../engine";
import type { RowColor } from "../coloring";
import type { ColumnDef } from "../columns";

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
  marked,
  colors,
  columns,
  onSelect,
}: {
  rows: { idx: number; s: Summary }[];
  selected: number | null;
  marked: Set<number>;
  colors: RowColor[];
  columns: ColumnDef[];
  onSelect: (idx: number) => void;
}) {
  const selRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="packet-list">
      <table>
        <thead>
          <tr>
            <th className="c-mark"></th>
            {columns.map((c) => (
              <th key={c.key} className={c.className}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ idx, s }) => {
            const isSel = selected === idx;
            const c = colors[idx];
            return (
              <tr
                key={idx}
                ref={isSel ? selRef : undefined}
                className={`${c ? "" : protoClass(s.proto)}${isSel ? " selected" : ""}${marked.has(idx) ? " marked" : ""}`}
                style={c && !isSel ? { background: c.bg, color: c.fg } : undefined}
                onClick={() => onSelect(idx)}
              >
                <td className="c-mark">{marked.has(idx) ? "◆" : ""}</td>
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>{col.render(s)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="pane-empty">No packets</div>}
    </div>
  );
}
