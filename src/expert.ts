export type Severity = "error" | "warn" | "note" | "chat";

export interface ExpertRule {
  id: number;
  severity: Severity;
  name: string;
  filter: string;
  enabled: boolean;
  info?: string; // what it means
  fix?: string; // suggested remediation
}

// Help keyed by filter, so explanations show even for rules already saved in
// localStorage (which predate the info/fix fields).
export const EXPERT_HELP: Record<string, { info: string; fix: string }> = {
  "ip.checksum.bad": {
    info: "The IPv4 header checksum doesn't match the header — the packet may be corrupted, or the checksum was offloaded to the NIC and left blank/incorrect at capture time.",
    fix: "If you captured on the sending host this is usually harmless checksum offload — confirm on the receiver, or disable offload for testing (e.g. `ethtool -K <iface> tx off rx off`). Persistent mismatches on received traffic point to corruption or a faulty device/link.",
  },
  "tcp.analysis.retransmission": {
    info: "A TCP segment carrying data that was already sent got sent again — the original segment or its ACK was lost or delayed.",
    fix: "Look for packet loss on the path: congested links, overloaded middleboxes/NICs, or a lossy hop. Correlate with duplicate ACKs just before it and check interface error/drop counters at each hop.",
  },
  "tcp.analysis.out_of_order": {
    info: "A segment arrived with a sequence number ahead of what was expected — earlier data is missing or arrived later.",
    fix: "Often benign when traffic is spread over parallel paths/queues (ECMP, LACP hashing). If frequent, investigate reordering in the network or drops at the capture point.",
  },
  "tcp.analysis.duplicate_ack": {
    info: "The receiver re-acknowledged the same sequence number, signalling it is missing a segment.",
    fix: "Three or more duplicate ACKs trigger fast retransmit — indicates loss upstream of the receiver. Find the lossy hop; correlate with the matching retransmission.",
  },
  "tcp.flags.reset == 1": {
    info: "A TCP RST abruptly aborted the connection instead of a graceful FIN close.",
    fix: "Expected when a port is closed/refused or an app resets intentionally. If unexpected, check firewalls/IPS that inject resets, application crashes, or half-open/idle timeouts.",
  },
  "tcp.window_size == 0": {
    info: "A host advertised a zero receive window — its receive buffer is full, so the sender must stop until the window reopens.",
    fix: "The receiving application isn't reading fast enough. Investigate a slow/overloaded consumer, CPU starvation, or a stuck thread on the receiver.",
  },
  "icmp.type == 3": {
    info: "A router or host reported the destination unreachable (network/host/port/fragmentation-needed).",
    fix: "Port unreachable = nothing listening; check the service. Network/host = routing or firewall. 'Fragmentation needed' = a PMTUD black hole — fix MTU/clamp MSS.",
  },
  "http || http2": {
    info: "Cleartext HTTP traffic (credentials, cookies and content are visible on the wire).",
    fix: "Informational. For sensitive services, move to HTTPS/TLS.",
  },
  "tcp.checksum.bad": {
    info: "The TCP checksum doesn't match — almost always NIC checksum offload on captured outbound packets, occasionally real corruption.",
    fix: "Ignore for locally-captured egress traffic (offload). Verify on the receiver; genuine mismatches on inbound traffic indicate corruption.",
  },
};

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
  { severity: "warn", name: "TCP retransmission", filter: "tcp.analysis.retransmission" },
  { severity: "warn", name: "TCP out-of-order segment", filter: "tcp.analysis.out_of_order" },
  { severity: "note", name: "TCP duplicate ACK", filter: "tcp.analysis.duplicate_ack" },
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
