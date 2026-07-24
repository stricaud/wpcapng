// App-side "enrichment" pseudo-fields that the WASM dissector can't produce:
//   ip.geoip.{src_,dst_,}{country,asn,org}   (from the bundled GeoIP DB)
//   tcp.analysis.{retransmission,duplicate_ack,out_of_order}  (from getTcpAnalysis)
// Exposed as custom columns and as a JS filter/coloring predicate so they slot
// into the same UI as real display-filter fields.
import type { Summary } from "./engine";
import { classify, lookup, type GeoDB } from "./geoip";

const GEO_FIELDS = [
  "ip.geoip.country", "ip.geoip.asn", "ip.geoip.org",
  "ip.geoip.src_country", "ip.geoip.dst_country",
  "ip.geoip.src_asn", "ip.geoip.dst_asn",
  "ip.geoip.src_org", "ip.geoip.dst_org",
];
const TCP_FIELDS = ["tcp.analysis.retransmission", "tcp.analysis.duplicate_ack", "tcp.analysis.out_of_order"];
export const ENRICH_FIELDS = [...GEO_FIELDS, ...TCP_FIELDS];
const KNOWN = new Set(ENRICH_FIELDS);

export interface TcpAnalysis {
  retransmission: Uint8Array;
  dupAck: Uint8Array;
  outOfOrder: Uint8Array;
}

export interface Enrich {
  has(field: string): boolean;
  columnValue(field: string, idx: number): string;
  isEnrichExpr(expr: string): boolean;
  // Full per-packet mask if `expr` is a single enrichment term; else null.
  maskFor(expr: string): Uint8Array | null;
}

interface GeoRow { srcC: string; dstC: string; srcA: string; dstA: string; srcO: string; dstO: string }

export function buildEnrich(summaries: Summary[], geoDb: GeoDB | null, tcp: TcpAnalysis | null): Enrich {
  const n = summaries.length;
  const geo: GeoRow[] = new Array(n);
  const geoOf = (ip: string) => {
    if (!geoDb || classify(ip) !== "public") return { country: "", asn: "", org: "" };
    const g = lookup(geoDb, ip);
    return { country: g.country ?? "", asn: g.asn ? String(g.asn) : "", org: g.org ?? "" };
  };
  for (let i = 0; i < n; i++) {
    const s = geoOf(summaries[i].src), d = geoOf(summaries[i].dst);
    geo[i] = { srcC: s.country, dstC: d.country, srcA: s.asn, dstA: d.asn, srcO: s.org, dstO: d.org };
  }

  const boolField = (f: string): Uint8Array | null =>
    f === "tcp.analysis.retransmission" ? tcp?.retransmission ?? null
    : f === "tcp.analysis.duplicate_ack" ? tcp?.dupAck ?? null
    : f === "tcp.analysis.out_of_order" ? tcp?.outOfOrder ?? null
    : null;

  // candidate string values of a value-field for packet i (any-match over src/dst)
  const valuesOf = (field: string, i: number): string[] => {
    const g = geo[i];
    switch (field) {
      case "ip.geoip.src_country": return [g.srcC];
      case "ip.geoip.dst_country": return [g.dstC];
      case "ip.geoip.country": return [g.srcC, g.dstC];
      case "ip.geoip.src_asn": return [g.srcA];
      case "ip.geoip.dst_asn": return [g.dstA];
      case "ip.geoip.asn": return [g.srcA, g.dstA];
      case "ip.geoip.src_org": return [g.srcO];
      case "ip.geoip.dst_org": return [g.dstO];
      case "ip.geoip.org": return [g.srcO, g.dstO];
      default: return [];
    }
  };

  const columnValue = (field: string, i: number): string => {
    const b = boolField(field);
    if (b) return b[i] ? "✓" : "";
    const g = geo[i];
    switch (field) {
      case "ip.geoip.country": return [g.srcC, g.dstC].filter(Boolean).join(" → ");
      case "ip.geoip.asn": return [g.srcA, g.dstA].filter(Boolean).map((a) => "AS" + a).join(" → ");
      case "ip.geoip.org": return [g.srcO, g.dstO].filter(Boolean).join(" → ");
      case "ip.geoip.src_asn": case "ip.geoip.dst_asn": { const v = valuesOf(field, i)[0]; return v ? "AS" + v : ""; }
      default: return valuesOf(field, i)[0] ?? "";
    }
  };

  const parse = (expr: string) => {
    const e = expr.trim();
    if (/&&|\|\||[()]/.test(e)) return null; // single-term enrichment only
    const m = e.match(/^([a-z0-9_.]+)\s*(==|!=|eq|ne|contains)?\s*(.*)$/i);
    if (!m || !KNOWN.has(m[1])) return null;
    const op = ({ eq: "==", ne: "!=" } as Record<string, string>)[m[2] ?? ""] ?? m[2] ?? "";
    return { field: m[1], op, value: m[3].replace(/^"|"$/g, "").trim() };
  };

  const matches = (field: string, op: string, value: string, i: number): boolean => {
    const b = boolField(field);
    if (b) {
      const on = !!b[i];
      if (!op) return on;
      const want = value === "0" ? false : true;
      return op === "!=" ? on !== want : on === want;
    }
    const cands = valuesOf(field, i).filter((x) => x !== "");
    if (!op) return cands.length > 0; // existence
    const v = value.toLowerCase();
    return cands.some((c) => {
      const cc = c.toLowerCase();
      if (op === "contains") return cc.includes(v);
      if (op === "!=") return cc !== v;
      return cc === v;
    });
  };

  return {
    has: (f) => KNOWN.has(f),
    columnValue,
    isEnrichExpr: (expr) => parse(expr) !== null,
    maskFor: (expr) => {
      const p = parse(expr);
      if (!p) return null;
      const mask = new Uint8Array(n);
      for (let i = 0; i < n; i++) mask[i] = matches(p.field, p.op, p.value, i) ? 1 : 0;
      return mask;
    },
  };
}
