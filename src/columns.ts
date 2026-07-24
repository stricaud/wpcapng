import type { Summary } from "./engine";

export interface ColumnMeta {
  key: string;
  label: string;
  className: string;
  render: (s: Summary) => string | number;
}

export const COLUMN_DEFS: ColumnMeta[] = [
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
  key: string; // builtin key, or "custom:<abbrev>"
  visible: boolean;
  abbrev?: string; // for custom columns
  label?: string; // for custom columns
}

export type TimeFormat = "relative" | "abs-local" | "abs-utc" | "delta";

const COLS_KEY = "wpcapng.columns.v1";
const TIME_KEY = "wpcapng.timefmt.v1";
export const DEFAULT_COLS: ColConfig[] = COLUMN_DEFS.map((c) => ({ key: c.key, visible: true }));

export function loadCols(): ColConfig[] {
  try {
    const raw = localStorage.getItem(COLS_KEY);
    if (!raw) return DEFAULT_COLS;
    const parsed = JSON.parse(raw) as ColConfig[];
    // append any builtin columns added since the config was saved
    for (const c of COLUMN_DEFS) if (!parsed.some((p) => p.key === c.key)) parsed.push({ key: c.key, visible: true });
    return parsed.length ? parsed : DEFAULT_COLS;
  } catch {
    return DEFAULT_COLS;
  }
}
export function saveCols(cols: ColConfig[]): void {
  localStorage.setItem(COLS_KEY, JSON.stringify(cols));
}
export function loadTimeFormat(): TimeFormat {
  return (localStorage.getItem(TIME_KEY) as TimeFormat) || "relative";
}
export function saveTimeFormat(f: TimeFormat): void {
  localStorage.setItem(TIME_KEY, f);
}
export function colLabel(c: ColConfig): string {
  return c.key.startsWith("custom:") ? c.label || c.abbrev || c.key : COLUMN_BY_KEY.get(c.key)?.label ?? c.key;
}

export interface RuntimeColumn {
  key: string;
  label: string;
  className: string;
  value: (idx: number, s: Summary) => string | number;
}

interface Ctx {
  timeFormat: TimeFormat;
  startTime: number;
  summaries: Summary[];
  custom: Record<string, string[]>; // by column key
}

function fmtTime(idx: number, s: Summary, ctx: Ctx): string {
  switch (ctx.timeFormat) {
    case "delta": {
      const prev = ctx.summaries[idx - 1]?.time ?? s.time;
      return (s.time - prev).toFixed(6);
    }
    case "abs-local": {
      const d = new Date((ctx.startTime + s.time) * 1000);
      return `${d.toLocaleTimeString(undefined, { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
    }
    case "abs-utc":
      return new Date((ctx.startTime + s.time) * 1000).toISOString();
    default:
      return s.time.toFixed(6);
  }
}

// Build the ordered, visible runtime columns for the given config + context.
export function buildColumns(cols: ColConfig[], ctx: Ctx): RuntimeColumn[] {
  const out: RuntimeColumn[] = [];
  for (const c of cols) {
    if (!c.visible) continue;
    if (c.key.startsWith("custom:")) {
      out.push({
        key: c.key,
        label: c.label || c.abbrev || c.key,
        className: "c-custom",
        value: (idx) => ctx.custom[c.key]?.[idx] ?? "",
      });
    } else {
      const def = COLUMN_BY_KEY.get(c.key);
      if (!def) continue;
      out.push({
        key: def.key,
        label: def.label,
        className: def.className,
        value: def.key === "time" ? (idx, s) => fmtTime(idx, s, ctx) : (_idx, s) => def.render(s),
      });
    }
  }
  return out;
}
