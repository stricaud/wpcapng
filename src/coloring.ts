import type { LibpcapngModule } from "./engine";

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
  { name: "Bad TCP", filter: "tcp.flags.reset == 1", fg: "#ffffff", bg: "#7a1f1f" },
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

export type RowColor = { fg: string; bg: string } | null;

// One color per packet: the first enabled rule whose filter matches. Evaluates
// all rule filters in a single dissection pass via matchFilters.
export function computeRowColors(engine: LibpcapngModule, rules: ColorRule[], count: number): RowColor[] {
  const out: RowColor[] = new Array(count).fill(null);
  const active = rules.filter((r) => r.enabled && r.filter.trim());
  if (active.length === 0 || count === 0) return out;
  const masks = engine.matchFilters(active.map((r) => r.filter));
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < active.length; k++) {
      if (masks[k][i]) {
        out[i] = { fg: active[k].fg, bg: active[k].bg };
        break;
      }
    }
  }
  return out;
}
