import type { LibpcapngModule } from "./engine";
import type { Enrich } from "./enrichment";

export interface ColorRule {
  id: number;
  name: string;
  filter: string;
  fg: string;
  bg: string;
  enabled: boolean;
}

const KEY = "wpcapng.colorrules.v1";

// Ordered: first matching rule wins (like Wireshark).
export const DEFAULT_RULES: ColorRule[] = [
  { name: "TCP retransmission", filter: "tcp.analysis.retransmission", fg: "#ffffff", bg: "#7a1f1f" },
  { name: "TCP out-of-order", filter: "tcp.analysis.out_of_order", fg: "#ffd0ff", bg: "#4a2a4a" },
  { name: "TCP duplicate ACK", filter: "tcp.analysis.duplicate_ack", fg: "#ffe0a0", bg: "#5a3a1a" },
  { name: "Connection reset", filter: "tcp.flags.reset == 1", fg: "#ffffff", bg: "#7a1f1f" },
  { name: "HTTP", filter: "http || http2", fg: "#e8d9a0", bg: "#3a3320" },
  { name: "DNS", filter: "dns", fg: "#d0b8ff", bg: "#2b2438" },
  { name: "TLS", filter: "tls", fg: "#a0e8c0", bg: "#14322a" },
  { name: "ICMP", filter: "icmp || icmpv6", fg: "#f0a0a0", bg: "#3a2020" },
  { name: "ARP", filter: "arp", fg: "#e0e0a0", bg: "#2f2f18" },
  { name: "UDP", filter: "udp", fg: "#a0c8e0", bg: "#182a34" },
  { name: "TCP", filter: "tcp", fg: "#a8c8e0", bg: "#17303f" },
].map((r, i) => ({ id: i + 1, enabled: true, ...r }));

export function loadColorRules(): ColorRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ColorRule[]) : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

export function saveColorRules(rules: ColorRule[]): void {
  localStorage.setItem(KEY, JSON.stringify(rules));
}

export type RowColor = { fg: string; bg: string; rule: string } | null;

// One color per packet: the first enabled rule whose filter matches. WASM
// display-filter rules are evaluated in a single batched pass; enrichment rules
// (ip.geoip.* / tcp.analysis.*) are evaluated in JS.
export function computeRowColors(
  engine: LibpcapngModule,
  rules: ColorRule[],
  count: number,
  enrich?: Enrich,
): RowColor[] {
  const out: RowColor[] = new Array(count).fill(null);
  const active = rules.filter((r) => r.enabled && r.filter.trim());
  if (active.length === 0 || count === 0) return out;
  // per-rule mask, aligned with `active`
  const enrichMasks = active.map((r) => (enrich?.isEnrichExpr(r.filter) ? enrich.maskFor(r.filter) : null));
  const wasmIdx: number[] = [];
  active.forEach((_, k) => { if (!enrichMasks[k]) wasmIdx.push(k); });
  const wasmMasks = wasmIdx.length ? engine.matchFilters(wasmIdx.map((k) => active[k].filter)) : [];
  const masks: (Uint8Array | null)[] = active.map((_, k) => enrichMasks[k]);
  wasmIdx.forEach((k, j) => (masks[k] = wasmMasks[j]));

  for (let i = 0; i < count; i++) {
    for (let k = 0; k < active.length; k++) {
      if (masks[k] && masks[k]![i]) {
        out[i] = { fg: active[k].fg, bg: active[k].bg, rule: active[k].name };
        break;
      }
    }
  }
  return out;
}
