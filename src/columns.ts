import type { Summary } from "./engine";

export interface ColumnMeta {
  key: string;
  label: string;
  className: string;
  numeric?: boolean; // sort as a number, not a string (ports, length, no.)
  render: (s: Summary) => string | number;
  // value used for sorting — the raw underlying datum, not the formatted string
  // (so Time sorts chronologically regardless of display format). "" = blank.
  sortOf?: (s: Summary) => number | string;
}

export const COLUMN_DEFS: ColumnMeta[] = [
  { key: "no", label: "No.", className: "c-no", numeric: true, render: (s) => s.no, sortOf: (s) => s.no },
  { key: "time", label: "Time", className: "c-time", numeric: true, render: (s) => s.time.toFixed(6), sortOf: (s) => s.time },
  { key: "src", label: "Source", className: "c-addr", render: (s) => s.src },
  { key: "srcport", label: "Src port", className: "c-port", numeric: true, render: (s) => s.srcport, sortOf: (s) => (s.srcport === "" ? "" : Number(s.srcport)) },
  { key: "dst", label: "Destination", className: "c-addr", render: (s) => s.dst },
  { key: "dstport", label: "Dst port", className: "c-port", numeric: true, render: (s) => s.dstport, sortOf: (s) => (s.dstport === "" ? "" : Number(s.dstport)) },
  { key: "proto", label: "Protocol", className: "c-proto", render: (s) => s.proto },
  { key: "length", label: "Length", className: "c-len", numeric: true, render: (s) => s.length, sortOf: (s) => s.length },
  { key: "info", label: "Info", className: "c-info", render: (s) => s.info },
];
export const COLUMN_BY_KEY = new Map(COLUMN_DEFS.map((c) => [c.key, c]));

export interface ColConfig {
  key: string; // builtin key, or "custom:<abbrev>"
  visible: boolean;
  abbrev?: string; // for custom columns
  label?: string; // for custom columns
  width?: number; // pixel width when the user has resized it
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
    // splice in any builtin columns added since the config was saved, next to
    // the builtin that precedes them in COLUMN_DEFS (so e.g. "Src port" lands
    // right after "Source" rather than at the far right).
    COLUMN_DEFS.forEach((c, i) => {
      if (parsed.some((p) => p.key === c.key)) return;
      const prevKey = COLUMN_DEFS[i - 1]?.key;
      const at = parsed.findIndex((p) => p.key === prevKey);
      const entry = { key: c.key, visible: true };
      if (at >= 0) parsed.splice(at + 1, 0, entry);
      else parsed.push(entry);
    });
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
  numeric: boolean;
  width?: number;
  value: (idx: number, s: Summary) => string | number;
  sortValue: (idx: number, s: Summary) => number | string; // "" = blank (sorts last)
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
      const get = (idx: number) => ctx.custom[c.key]?.[idx] ?? "";
      out.push({
        key: c.key,
        label: c.label || c.abbrev || c.key,
        className: "c-custom",
        numeric: false, // custom columns sort as text (ports/length are builtins)
        width: c.width,
        value: (idx) => get(idx),
        sortValue: (idx) => get(idx).toLowerCase(),
      });
    } else {
      const def = COLUMN_BY_KEY.get(c.key);
      if (!def) continue;
      out.push({
        key: def.key,
        label: def.label,
        className: def.className,
        numeric: !!def.numeric,
        width: c.width,
        value: def.key === "time" ? (idx, s) => fmtTime(idx, s, ctx) : (_idx, s) => def.render(s),
        sortValue: def.sortOf
          ? (_idx, s) => def.sortOf!(s)
          : (_idx, s) => String(def.render(s)).toLowerCase(),
      });
    }
  }
  return out;
}

export type SortState = { key: string; dir: 1 | -1 } | null;

// Type-aware, stable sort. Numeric columns compare as numbers; the rest as
// lower-cased text. Blank values always sort last (both directions), and ties
// fall back to the original packet index so the order stays stable.
export function sortRows<T extends { idx: number; s: Summary }>(
  rows: T[], col: RuntimeColumn | undefined, dir: 1 | -1,
): T[] {
  if (!col) return rows;
  const copy = rows.slice();
  copy.sort((ra, rb) => {
    const va = col.sortValue(ra.idx, ra.s), vb = col.sortValue(rb.idx, rb.s);
    const ea = va === "" || (typeof va === "number" && Number.isNaN(va));
    const eb = vb === "" || (typeof vb === "number" && Number.isNaN(vb));
    if (ea && eb) return ra.idx - rb.idx;
    if (ea) return 1;
    if (eb) return -1;
    let c = col.numeric ? (va as number) - (vb as number) : va < vb ? -1 : va > vb ? 1 : 0;
    if (c === 0) return ra.idx - rb.idx;
    return dir * c;
  });
  return copy;
}

// Move column `fromKey` to the position of `toKey` (drag-and-drop reorder).
export function reorderCols(cols: ColConfig[], fromKey: string, toKey: string): ColConfig[] {
  const from = cols.findIndex((c) => c.key === fromKey);
  const to = cols.findIndex((c) => c.key === toKey);
  if (from < 0 || to < 0 || from === to) return cols;
  const copy = cols.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}
