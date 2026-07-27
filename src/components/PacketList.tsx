import { useEffect, useRef } from "react";
import type { Summary } from "../engine";
import type { RowColor } from "../coloring";
import type { RuntimeColumn, SortState } from "../columns";

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
  commented,
  colors,
  columns,
  sort,
  onSelect,
  onSort,
  onResize,
  onReorder,
}: {
  rows: { idx: number; s: Summary }[];
  selected: number | null;
  marked: Set<number>;
  commented: Set<number>;
  colors: RowColor[];
  columns: RuntimeColumn[];
  sort: SortState;
  onSelect: (idx: number) => void;
  onSort: (key: string) => void;
  onResize: (key: string, width: number) => void;
  onReorder: (fromKey: string, toKey: string) => void;
}) {
  const selRef = useRef<HTMLTableRowElement>(null);
  // Set while resizing/dragging a header so the ensuing click doesn't sort.
  const suppressClick = useRef(false);
  const dragKey = useRef<string | null>(null);

  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const startResize = (e: React.MouseEvent, col: RuntimeColumn) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement;
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    suppressClick.current = true;
    const move = (ev: MouseEvent) => onResize(col.key, Math.max(40, Math.round(startW + ev.clientX - startX)));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setTimeout(() => (suppressClick.current = false), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="packet-list">
      <table>
        <thead>
          <tr>
            <th className="c-mark"></th>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.className}${sort?.key === c.key ? " sorted" : ""}`}
                style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                title="Click to sort · drag to reorder"
                draggable
                onDragStart={(e) => {
                  if (suppressClick.current) { e.preventDefault(); return; }
                  dragKey.current = c.key;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!dragKey.current || dragKey.current === c.key) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  e.currentTarget.classList.add("dragover");
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("dragover");
                  if (dragKey.current && dragKey.current !== c.key) onReorder(dragKey.current, c.key);
                  dragKey.current = null;
                }}
                onDragEnd={() => { dragKey.current = null; }}
                onClick={() => { if (!suppressClick.current) onSort(c.key); }}
              >
                <span className="th-label">{c.label}</span>
                {sort?.key === c.key && <span className="th-arrow">{sort.dir === 1 ? "▲" : "▼"}</span>}
                <span className="col-resize" onMouseDown={(e) => startResize(e, c)} onClick={(e) => e.stopPropagation()} />
              </th>
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
                <td className="c-mark">{marked.has(idx) ? "◆" : ""}{commented.has(idx) ? "🗩" : ""}</td>
                {columns.map((col) => (
                  <td key={col.key} className={col.className} style={col.width ? { width: col.width, minWidth: col.width } : undefined}>
                    {col.value(idx, s)}
                  </td>
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
