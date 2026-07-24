// Compact IPv4 → country + ASN lookup, from a bundled binary built by
// scripts/build-geoip.mjs (from iptoasn.com open data). Binary-searchable.
//
// Format (LE): "GIP2" | u16 C | C×(2 ASCII ISO2) | u32 N |
//   N×u32 start | N×u32 end | N×u16 ccIndex | N×u32 asn |
//   u32 M | M×(u32 asn, u16 len, len×utf8)   (org table, sorted by asn)

export interface GeoDB {
  starts: Uint32Array;
  ends: Uint32Array;
  cc: Uint16Array;
  asn: Uint32Array;
  countries: string[];
  asnOrg: Map<number, string>;
}

export interface GeoInfo {
  country: string | null;
  asn: number | null;
  org: string | null;
}

export function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let v = 0;
  for (const s of p) {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    v = v * 256 + n;
  }
  return v >>> 0;
}

export type Class = "private" | "loopback" | "linklocal" | "multicast" | "reserved" | "public";

export function classify(ip: string): Class {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    if (l === "::1") return "loopback";
    if (l.startsWith("fe80")) return "linklocal";
    if (l.startsWith("ff")) return "multicast";
    if (l.startsWith("fc") || l.startsWith("fd")) return "private";
    return "public";
  }
  const v = ipv4ToInt(ip);
  if (v == null) return "reserved";
  const a = (v >>> 24) & 0xff, b = (v >>> 16) & 0xff;
  if (a === 10) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "linklocal";
  if (a >= 224 && a <= 239) return "multicast";
  if (a === 0 || a >= 240) return "reserved";
  return "public";
}

export function parseGeoDB(buf: ArrayBuffer): GeoDB | null {
  const dv = new DataView(buf);
  const td = new TextDecoder();
  if (dv.byteLength < 6 || String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== "GIP2")
    return null;
  let o = 4;
  const C = dv.getUint16(o, true); o += 2;
  const countries: string[] = [];
  for (let i = 0; i < C; i++) { countries.push(String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1))); o += 2; }
  const N = dv.getUint32(o, true); o += 4;
  const starts = new Uint32Array(N), ends = new Uint32Array(N), cc = new Uint16Array(N), asn = new Uint32Array(N);
  for (let i = 0; i < N; i++) { starts[i] = dv.getUint32(o, true); o += 4; }
  for (let i = 0; i < N; i++) { ends[i] = dv.getUint32(o, true); o += 4; }
  for (let i = 0; i < N; i++) { cc[i] = dv.getUint16(o, true); o += 2; }
  for (let i = 0; i < N; i++) { asn[i] = dv.getUint32(o, true); o += 4; }
  const asnOrg = new Map<number, string>();
  const M = dv.getUint32(o, true); o += 4;
  for (let i = 0; i < M; i++) {
    const a = dv.getUint32(o, true); o += 4;
    const len = dv.getUint16(o, true); o += 2;
    asnOrg.set(a, td.decode(new Uint8Array(buf, o, len))); o += len;
  }
  return { starts, ends, cc, asn, countries, asnOrg };
}

export function lookup(db: GeoDB, ip: string): GeoInfo {
  const v = ipv4ToInt(ip);
  if (v == null) return { country: null, asn: null, org: null };
  const { starts, ends, cc, asn, countries, asnOrg } = db;
  let lo = 0, hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (v < starts[mid]) hi = mid - 1;
    else if (v > ends[mid]) lo = mid + 1;
    else {
      const a = asn[mid] || null;
      return { country: countries[cc[mid]] ?? null, asn: a, org: a ? asnOrg.get(a) ?? null : null };
    }
  }
  return { country: null, asn: null, org: null };
}

let loadP: Promise<GeoDB | null> | null = null;
export function loadGeo(): Promise<GeoDB | null> {
  if (!loadP) {
    loadP = fetch(`${import.meta.env.BASE_URL}geoip-country.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? parseGeoDB(b) : null))
      .catch(() => null);
  }
  return loadP;
}
