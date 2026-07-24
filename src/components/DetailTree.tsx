import { useEffect, useRef, useState } from "react";
import type { Field } from "../engine";

function FieldNode({
  field,
  onHover,
  onSelect,
  selected,
  active,
  depth,
}: {
  field: Field;
  onHover: (range: [number, number] | null) => void;
  onSelect: (range: [number, number]) => void;
  selected: [number, number] | null;
  active: [number, number] | null;
  depth: number;
}) {
  const hasKids = field.children.length > 0;
  const range: [number, number] = [field.off, field.len];

  // Does the current selection anchor fall inside this node's byte range?
  // Used to auto-expand ancestors when a field is selected (e.g. from the hex
  // view), so the target is revealed.
  const containsAnchor =
    selected != null &&
    field.len > 0 &&
    selected[0] >= field.off &&
    selected[0] < field.off + field.len;

  const isSelected =
    selected != null && field.off === selected[0] && field.len === selected[1];

  // Tinted (but not committed) when a byte is hovered over in the hex view.
  const isActive =
    active != null && field.off === active[0] && field.len === active[1];

  const [userOpen, setUserOpen] = useState(depth < 1);
  const open = containsAnchor ? true : userOpen;

  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const text = field.value
    ? `${field.label || field.abbrev}: ${field.value}`
    : field.label || field.abbrev;

  return (
    <div className="tree-node">
      <div
        ref={rowRef}
        className={`tree-row${isSelected ? " selected" : ""}${
          isActive && !isSelected ? " active" : ""
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onMouseEnter={() => field.len > 0 && onHover(range)}
        onMouseLeave={() => onHover(null)}
        onClick={() => {
          if (hasKids) setUserOpen((o) => !o);
          if (field.len > 0) onSelect(range);
        }}
        title={field.abbrev}
      >
        <span className="twisty">{hasKids ? (open ? "▾" : "▸") : ""}</span>
        <span className="tree-text">{text}</span>
      </div>
      {open &&
        field.children.map((c, i) => (
          <FieldNode
            key={i}
            field={c}
            onHover={onHover}
            onSelect={onSelect}
            selected={selected}
            active={active}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function DetailTree({
  layers,
  onHover,
  onSelect,
  selected,
  active,
}: {
  layers: Field[] | null;
  onHover: (range: [number, number] | null) => void;
  onSelect: (range: [number, number]) => void;
  selected: [number, number] | null;
  active: [number, number] | null;
}) {
  if (!layers) return <div className="pane-empty">Select a packet</div>;
  return (
    <div className="detail-tree">
      {layers.map((l, i) => (
        <FieldNode
          key={i}
          field={l}
          onHover={onHover}
          onSelect={onSelect}
          selected={selected}
          active={active}
          depth={0}
        />
      ))}
    </div>
  );
}
