export type Severity = "error" | "warn" | "note" | "chat";

export interface ExpertRule {
  id: number;
  severity: Severity;
  name: string;
  filter: string;
  enabled: boolean;
}

export const SEVERITY_ORDER: Severity[] = ["error", "warn", "note", "chat"];
export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  error: { label: "Error", color: "#d9534f" },
  warn: { label: "Warning", color: "#e8a33d" },
  note: { label: "Note", color: "#4a9eff" },
  chat: { label: "Chat", color: "#5fd35f" },
};

const KEY = "wpcapng.expert.v1";

// Filter-driven expert rules — extend freely, like coloring rules.
const BASE: Omit<ExpertRule, "id" | "enabled">[] = [
  { severity: "error", name: "Bad IP header checksum", filter: "ip.checksum.bad" },
  { severity: "warn", name: "Connection reset (RST)", filter: "tcp.flags.reset == 1" },
  { severity: "warn", name: "TCP zero window", filter: "tcp.window_size == 0" },
  { severity: "warn", name: "ICMP destination unreachable", filter: "icmp.type == 3" },
  { severity: "note", name: "Connection attempt (SYN)", filter: "tcp.flags.syn == 1 && tcp.flags.ack == 0" },
  { severity: "note", name: "Connection reset by peer path (RST/ACK)", filter: "tcp.flags.reset == 1 && tcp.flags.ack == 1" },
  { severity: "note", name: "ICMP echo (ping)", filter: "icmp.type == 8 || icmp.type == 0" },
  { severity: "chat", name: "TCP connection finish (FIN)", filter: "tcp.flags.fin == 1" },
  { severity: "chat", name: "HTTP request/response", filter: "http || http2" },
  { severity: "chat", name: "DNS query/response", filter: "dns" },
];
export const DEFAULT_EXPERT: ExpertRule[] = BASE.map((r, i) => ({ id: i + 1, enabled: true, ...r }));

export function loadExpert(): ExpertRule[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ExpertRule[]) : DEFAULT_EXPERT;
  } catch {
    return DEFAULT_EXPERT;
  }
}
export function saveExpert(rules: ExpertRule[]): void {
  localStorage.setItem(KEY, JSON.stringify(rules));
}
