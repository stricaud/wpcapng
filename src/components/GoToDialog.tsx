import { useState } from "react";

export default function GoToDialog({
  max,
  onGo,
  onClose,
}: {
  max: number;
  onGo: (packetNo: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  const go = () => {
    const n = parseInt(value, 10);
    if (n >= 1 && n <= max) {
      onGo(n);
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(360px, 92vw)" }}>
        <div className="modal-head">
          <h2>Go to packet</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <input
          className="text-input"
          type="number"
          min={1}
          max={max}
          autoFocus
          placeholder={`1 – ${max}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        <div className="fs-toolbar">
          <span className="spacer" />
          <button className="btn primary" onClick={go}>Go</button>
        </div>
      </div>
    </div>
  );
}
