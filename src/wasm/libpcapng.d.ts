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

export interface LibpcapngModule {
  loadCapture(bytes: Uint8Array): number;
  getPacketCount(): number;
  getSummaries(): Summary[];
  getDetail(index: number): Field[] | null;
  getPacketBytes(index: number): Uint8Array | null;
  loadPosaText(src: string): PosaLoadResult;
  listPosa(): PosaInfo[];
  listProtocols(): string[];
}

declare const createLibpcapng: (opts?: Record<string, unknown>) => Promise<LibpcapngModule>;
export default createLibpcapng;
