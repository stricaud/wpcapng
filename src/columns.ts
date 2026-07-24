import type { Summary } from "./engine";

export interface ColumnDef {
  key: string;
  label: string;
  className: string;
  render: (s: Summary) => string | number;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: "no", label: "No.", className: "c-no", render: (s) => s.no },
  { key: "time", label: "Time", className: "c-time", render: (s) => s.time.toFixed(6) },
  { key: "src", label: "Source", className: "c-addr", render: (s) => s.src },
  { key: "dst", label: "Destination", className: "c-addr", render: (s) => s.dst },
  { key: "proto", label: "Protocol", className: "c-proto", render: (s) => s.proto },
  { key: "length", label: "Length", className: "c-len", render: (s) => s.length },
  { key: "info", label: "Info", className: "c-info", render: (s) => s.info },
];

export const COLUMN_BY_KEY = new Map(COLUMN_DEFS.map((c) => [c.key, c]));

export interface ColConfig {
  key: string;
  visible: boolean;
}

const KEY = "wpcapng.columns.v1";
export const DEFAULT_COLS: ColConfig[] = COLUMN_DEFS.map((c) => ({ key: c.key, visible: true }));

export function loadCols(): ColConfig[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_COLS;
    const parsed = (JSON.parse(raw) as ColConfig[]).filter((c) => COLUMN_BY_KEY.has(c.key));
    // append any columns added since the config was saved
    for (const c of COLUMN_DEFS) if (!parsed.some((p) => p.key === c.key)) parsed.push({ key: c.key, visible: true });
    return parsed.length ? parsed : DEFAULT_COLS;
  } catch {
    return DEFAULT_COLS;
  }
}

export function saveCols(cols: ColConfig[]): void {
  localStorage.setItem(KEY, JSON.stringify(cols));
}

// The ordered, visible ColumnDefs for the given config.
export function resolveColumns(cols: ColConfig[]): ColumnDef[] {
  return cols.filter((c) => c.visible).map((c) => COLUMN_BY_KEY.get(c.key)!).filter(Boolean);
}
