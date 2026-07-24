import type { LibpcapngModule, Summary } from "./engine";

export interface FindParams {
  type: "filter" | "string" | "hex";
  scope: "info" | "bytes";
  caseSensitive: boolean;
  text: string;
}

export const defaultFindParams: FindParams = {
  type: "string",
  scope: "info",
  caseSensitive: false,
  text: "",
};

export function parseHex(s: string): Uint8Array | null {
  const clean = s.replace(/0x/gi, "").replace(/[\s:]/g, "");
  if (clean.length === 0 || clean.length % 2 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function bytesContain(hay: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/* Find the next/previous matching packet within the displayed `list`, starting
   from `selected`. Wraps around. Returns the packet index or null. */
export function findPacket(
  engine: LibpcapngModule,
  summaries: Summary[],
  list: number[],
  selected: number | null,
  params: FindParams,
  dir: 1 | -1,
): number | null {
  if (!params.text.trim() || list.length === 0) return null;
  const filterMask = params.type === "filter" ? engine.matchFilter(params.text) : null;
  const needleStr = params.type === "string" ? (params.caseSensitive ? params.text : params.text.toLowerCase()) : "";
  const needleHex = params.type === "hex" ? parseHex(params.text) : null;
  if (params.type === "hex" && !needleHex) return null;
  const dec = new TextDecoder("latin1");

  const test = (idx: number): boolean => {
    if (params.type === "filter") return !!(filterMask && filterMask[idx]);
    if (params.type === "string") {
      if (params.scope === "info") {
        const s = summaries[idx];
        let hay = `${s.src} ${s.dst} ${s.proto} ${s.info}`;
        if (!params.caseSensitive) hay = hay.toLowerCase();
        return hay.includes(needleStr);
      }
      const b = engine.getPacketBytes(idx);
      if (!b) return false;
      let hay = dec.decode(b);
      if (!params.caseSensitive) hay = hay.toLowerCase();
      return hay.includes(needleStr);
    }
    const b = engine.getPacketBytes(idx);
    return !!(b && needleHex && bytesContain(b, needleHex));
  };

  const curPos = selected == null ? -1 : list.indexOf(selected);
  for (let step = 1; step <= list.length; step++) {
    const pos = (((curPos + dir * step) % list.length) + list.length) % list.length;
    if (test(list[pos])) return list[pos];
  }
  return null;
}
