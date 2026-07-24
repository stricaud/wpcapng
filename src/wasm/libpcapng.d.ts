// Types for the Emscripten/embind module built from libpcapng/bindings/js.

export interface Field {
  abbrev: string; // "ip.src", "tcp.dstport"; "" for structural nodes
  label: string; // human-readable label
  value: string; // formatted value ("" for structural)
  off: number; // absolute byte offset within the packet
  len: number; // byte length
  children: Field[];
}

export interface Summary {
  no: number;
  time: number; // seconds relative to first packet
  src: string;
  dst: string;
  proto: string;
  length: number;
  info: string;
}

export interface PosaInfo {
  name: string;
  display: string;
  abbrev: string;
}

export interface PosaLoadResult {
  ok: boolean;
  added: number;
  error: string;
}

export interface Conversation {
  id: number; // representative packet index (pass to getStream)
  proto: "TCP" | "UDP";
  addrA: string;
  portA: number;
  addrB: string;
  portB: number;
  packets: number;
  bytes: number;
}

export interface Stream {
  ok: boolean;
  proto: "TCP" | "UDP";
  clientIp: string;
  clientPort: number;
  serverIp: string;
  serverPort: number;
  packets: number;
  client: Uint8Array; // client → server bytes, reassembled
  server: Uint8Array; // server → client bytes, reassembled
  segments: StreamSegment[]; // interleaved chunks in arrival order
}

export interface StreamSegment {
  dir: 0 | 1; // 0 = client→server, 1 = server→client
  data: Uint8Array;
}

export interface Endpoint {
  address: string;
  packets: number;
  bytes: number;
  txPackets: number;
  txBytes: number;
  rxPackets: number;
  rxBytes: number;
}

export interface HierarchyNode {
  abbrev: string;
  name: string;
  packets: number;
  bytes: number;
  children: HierarchyNode[];
}

export interface StreamPacket {
  no: number;
  time: number; // absolute epoch seconds
  seq: number;
  ack: number;
  len: number;
  win: number;
  dir: 0 | 1; // 0 = client→server, 1 = server→client
  flags: number;
}
export interface StreamTimeline {
  clientIp: string;
  clientPort: number;
  serverIp: string;
  serverPort: number;
  packets: StreamPacket[];
}

export interface ExtractedObject {
  proto: string;
  frame: number;
  hostname: string;
  contentType: string;
  filename: string;
  complete: boolean;
  data: Uint8Array;
}

export interface LibpcapngModule {
  loadCapture(bytes: Uint8Array): number;
  getPacketCount(): number;
  getSummaries(): Summary[];
  getStartTime(): number; // absolute epoch seconds of first packet
  getFieldColumn(abbrev: string): string[]; // per-packet value of a field
  getDetail(index: number): Field[] | null;
  getPacketBytes(index: number): Uint8Array | null;
  getConversations(): Conversation[];
  getEndpoints(): Endpoint[];
  getProtocolHierarchy(): HierarchyNode[];
  getStream(index: number): Stream | null;
  getStreamPackets(index: number): StreamTimeline | null;
  getTcpAnalysis(): { retransmission: Uint8Array; dupAck: Uint8Array; outOfOrder: Uint8Array };
  extractObjects(proto: "http" | "smb"): ExtractedObject[];
  validateFilter(expr: string): { ok: boolean; error: string };
  matchFilter(expr: string): Uint8Array; // 1 byte per packet
  matchFilters(exprs: string[]): Uint8Array[]; // one mask per expr
  exportPcapng(indices: number[]): Uint8Array; // subset → new pcapng
  getComment(index: number): string;
  setComment(index: number, text: string): void;
  getCommentedPackets(): number[];

  loadPosaText(src: string): PosaLoadResult;
  listPosa(): PosaInfo[];
  listProtocols(): string[];
}

declare const createLibpcapng: (opts?: Record<string, unknown>) => Promise<LibpcapngModule>;
export default createLibpcapng;
