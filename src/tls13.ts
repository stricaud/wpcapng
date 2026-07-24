// TLS 1.3 decryption in the browser via Web Crypto (SubtleCrypto).
// Inputs: an SSLKEYLOGFILE (traffic secrets keyed by client_random) + the
// reassembled per-direction TCP byte streams of a TLS connection.
// Supports AEAD suites SubtleCrypto provides: AES-128-GCM / AES-256-GCM.
// (ChaCha20-Poly1305 and CCM are not in SubtleCrypto — reported as unsupported.)

const te = new TextEncoder();

function hex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
function fromHex(s: string): Uint8Array {
  const clean = s.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
function concat(...a: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const x of a) n += x.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
}
function be16(b: Uint8Array, o: number) { return (b[o] << 8) | b[o + 1]; }

// ── key log ─────────────────────────────────────────────────────────────────
export type KeyLog = Map<string, Record<string, Uint8Array>>; // client_random → label → secret

export function parseKeyLog(text: string): KeyLog {
  const map: KeyLog = new Map();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t[0] === "#") continue;
    const p = t.split(/\s+/);
    if (p.length !== 3) continue;
    const [label, cr, secret] = p;
    if (!/^[0-9a-fA-F]{64}$/.test(cr)) continue;
    const key = cr.toLowerCase();
    const rec = map.get(key) ?? {};
    rec[label] = fromHex(secret);
    map.set(key, rec);
  }
  return map;
}

// ── HKDF-Expand-Label (RFC 8446 §7.1), built on HMAC (SubtleCrypto) ───────────
async function hmac(hash: string, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}
async function hkdfExpand(hash: string, prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const hashLen = hash === "SHA-384" ? 48 : 32;
  const n = Math.ceil(length / hashLen);
  const out = new Uint8Array(n * hashLen);
  let prev: Uint8Array = new Uint8Array(0);
  for (let i = 1; i <= n; i++) {
    prev = await hmac(hash, prk, concat(prev, info, Uint8Array.of(i)));
    out.set(prev, (i - 1) * hashLen);
  }
  const res = new Uint8Array(length);
  res.set(out.subarray(0, length));
  return res;
}
async function expandLabel(hash: string, secret: Uint8Array, label: string, length: number): Promise<Uint8Array> {
  const full = te.encode("tls13 " + label);
  const info = concat(Uint8Array.of((length >> 8) & 0xff, length & 0xff), Uint8Array.of(full.length), full, Uint8Array.of(0));
  return hkdfExpand(hash, secret, info, length);
}
// exported for the RFC-8448 self-test
export async function deriveKeyIv(hash: string, secret: Uint8Array, keyLen: number) {
  return { key: await expandLabel(hash, secret, "key", keyLen), iv: await expandLabel(hash, secret, "iv", 12) };
}

// ── cipher suites ─────────────────────────────────────────────────────────────
const SUITES: Record<number, { name: string; hash: string; keyLen: number } | undefined> = {
  0x1301: { name: "TLS_AES_128_GCM_SHA256", hash: "SHA-256", keyLen: 16 },
  0x1302: { name: "TLS_AES_256_GCM_SHA384", hash: "SHA-384", keyLen: 32 },
  0x1303: { name: "TLS_CHACHA20_POLY1305_SHA256", hash: "SHA-256", keyLen: 32 }, // unsupported by SubtleCrypto
  0x1304: { name: "TLS_AES_128_CCM_SHA256", hash: "SHA-256", keyLen: 16 }, // unsupported by SubtleCrypto
};

export function clientRandom(stream: Uint8Array): string | null {
  if (stream.length < 43 || stream[0] !== 0x16 || stream[5] !== 0x01) return null; // handshake / ClientHello
  return hex(stream.subarray(11, 43));
}
export function cipherSuite(stream: Uint8Array): number | null {
  if (stream.length < 45 || stream[0] !== 0x16 || stream[5] !== 0x02) return null; // handshake / ServerHello
  const sidLen = stream[43];
  const off = 44 + sidLen;
  if (off + 2 > stream.length) return null;
  return be16(stream, off);
}

// Decrypt one direction's record stream. TLS 1.3: 0x16 records are plaintext
// (ClientHello/ServerHello), 0x17 are AEAD-encrypted. The first 0x17 records use
// the handshake secret; after the Finished, keys switch to the app secret with
// the sequence number reset to 0.
async function decryptDirection(
  stream: Uint8Array, hs: Uint8Array, app: Uint8Array, hash: string, keyLen: number,
): Promise<Uint8Array> {
  const hsK = await deriveKeyIv(hash, hs, keyLen);
  const appK = await deriveKeyIv(hash, app, keyLen);
  const hsKey = await crypto.subtle.importKey("raw", hsK.key as BufferSource, "AES-GCM", false, ["decrypt"]);
  const appKey = await crypto.subtle.importKey("raw", appK.key as BufferSource, "AES-GCM", false, ["decrypt"]);

  let useApp = false, seq = 0n;
  const chunks: Uint8Array[] = [];
  let off = 0;
  while (off + 5 <= stream.length) {
    const type = stream[off];
    const len = be16(stream, off + 3);
    const body = stream.subarray(off + 5, off + 5 + len);
    if (off + 5 + len > stream.length) break;
    off += 5 + len;
    if (type === 0x14) continue;            // change_cipher_spec (compat) — ignore
    if (type !== 0x17) continue;            // plaintext handshake / other — skip

    const iv = (useApp ? appK.iv : hsK.iv).slice();
    for (let i = 0; i < 8; i++) iv[11 - i] ^= Number((seq >> (8n * BigInt(i))) & 0xffn);
    const aad = stream.subarray(off - 5 - len, off - len); // 5-byte record header
    seq++;
    let inner: Uint8Array;
    try {
      inner = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 },
        useApp ? appKey : hsKey, body as BufferSource));
    } catch {
      break; // wrong keys / MAC fail — stop this direction
    }
    // strip zero padding; last non-zero byte is the real content type
    let end = inner.length - 1;
    while (end >= 0 && inner[end] === 0) end--;
    if (end < 0) continue;
    const ctype = inner[end];
    const content = inner.subarray(0, end);
    if (ctype === 0x17) chunks.push(content);            // application_data
    else if (ctype === 0x16 && !useApp && hasFinished(content)) { useApp = true; seq = 0n; }
  }
  return concat(...chunks);
}

// Does a handshake fragment contain a Finished (msg type 20)?
function hasFinished(hs: Uint8Array): boolean {
  let o = 0;
  while (o + 4 <= hs.length) {
    const t = hs[o];
    const l = (hs[o + 1] << 16) | (hs[o + 2] << 8) | hs[o + 3];
    if (t === 20) return true;
    o += 4 + l;
  }
  return false;
}

export interface DecryptResult {
  ok: boolean;
  error?: string;
  cipher?: string;
  client?: Uint8Array;
  server?: Uint8Array;
}

export async function decryptTls(clientStream: Uint8Array, serverStream: Uint8Array, keylog: KeyLog): Promise<DecryptResult> {
  const cr = clientRandom(clientStream);
  if (!cr) return { ok: false, error: "No TLS ClientHello at the start of this stream." };
  const secrets = keylog.get(cr);
  if (!secrets) return { ok: false, error: "No key-log secrets match this session's client random." };
  const suiteId = cipherSuite(serverStream);
  const suite = suiteId != null ? SUITES[suiteId] : undefined;
  if (!suite) return { ok: false, error: `Unknown/unsupported cipher suite (0x${(suiteId ?? 0).toString(16)}).` };
  if (suiteId === 0x1303 || suiteId === 0x1304)
    return { ok: false, error: `${suite.name} isn't supported by the browser's Web Crypto (AES-GCM only for now).` };

  const cH = secrets.CLIENT_HANDSHAKE_TRAFFIC_SECRET;
  const cA = secrets.CLIENT_TRAFFIC_SECRET_0;
  const sH = secrets.SERVER_HANDSHAKE_TRAFFIC_SECRET;
  const sA = secrets.SERVER_TRAFFIC_SECRET_0;
  if (!cH || !cA || !sH || !sA)
    return { ok: false, error: "Key log is missing handshake/traffic secrets for this session." };

  try {
    const client = await decryptDirection(clientStream, cH, cA, suite.hash, suite.keyLen);
    const server = await decryptDirection(serverStream, sH, sA, suite.hash, suite.keyLen);
    return { ok: true, cipher: suite.name, client, server };
  } catch (e) {
    return { ok: false, error: `Decryption failed: ${(e as Error).message}` };
  }
}
