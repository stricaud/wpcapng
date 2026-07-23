// Classic hex dump: offset | 16 hex bytes | ASCII, with the selected/hovered
// field's byte range highlighted. Bytes are clickable: clicking one selects the
// matching field in the detail tree.
const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".");
const hex2 = (b: number) => b.toString(16).padStart(2, "0");

export default function HexView({
  bytes,
  highlight,
  onByteSelect,
  onByteHover,
}: {
  bytes: Uint8Array | null;
  highlight: [number, number] | null; // [offset, length]
  onByteSelect?: (offset: number) => void;
  onByteHover?: (offset: number | null) => void;
}) {
  if (!bytes) return <div className="pane-empty">Select a packet</div>;

  const inRange = (i: number) =>
    highlight != null && i >= highlight[0] && i < highlight[0] + highlight[1];

  const rows = [];
  for (let off = 0; off < bytes.length; off += 16) {
    const slice = bytes.subarray(off, off + 16);
    const hexCells = [];
    const asciiCells = [];
    for (let i = 0; i < 16; i++) {
      const idx = off + i;
      if (i < slice.length) {
        const cls = inRange(idx) ? "hl" : "";
        const handlers = {
          onClick: () => onByteSelect?.(idx),
          onMouseEnter: () => onByteHover?.(idx),
        };
        hexCells.push(
          <span key={i} className={`hx clickable ${cls}`} {...handlers}>
            {hex2(slice[i])}
          </span>,
        );
        asciiCells.push(
          <span key={i} className={`ac clickable ${cls}`} {...handlers}>
            {printable(slice[i])}
          </span>,
        );
      } else {
        hexCells.push(
          <span key={i} className="hx">
            {"  "}
          </span>,
        );
        asciiCells.push(
          <span key={i} className="ac">
            {" "}
          </span>,
        );
      }
    }
    rows.push(
      <div className="hex-row" key={off}>
        <span className="hex-off">{off.toString(16).padStart(4, "0")}</span>
        <span className="hex-bytes">{hexCells}</span>
        <span className="hex-ascii">{asciiCells}</span>
      </div>,
    );
  }
  return (
    <div className="hex-view" onMouseLeave={() => onByteHover?.(null)}>
      {rows}
    </div>
  );
}
