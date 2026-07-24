#!/usr/bin/env node
// Build the compact bundled GeoIP assets for wpcapng:
//   public/geoip-country.bin   compact IPv4 range → country + ASN (from iptoasn.com)
//   public/world.geo.json      country polygons (Natural Earth 110m, has ISO_A2)
//
// Run once (needs internet):  npm run build:geoip
// iptoasn.com data is free to use. Re-run to refresh; commit the outputs.
import { writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(OUT, { recursive: true });

const IP2ASN = "https://iptoasn.com/data/ip2asn-v4.tsv.gz";
const WORLD = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

async function get(url) {
  process.stdout.write(`fetching ${url.split("/").slice(-1)[0]} … `);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  console.log("ok");
  return Buffer.from(await r.arrayBuffer());
}

function ipToInt(ip) {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let v = 0;
  for (const s of p) { const n = Number(s); if (!(n >= 0 && n <= 255)) return null; v = v * 256 + n; }
  return v >>> 0;
}

async function buildGeoIP() {
  const tsv = gunzipSync(await get(IP2ASN)).toString("utf8");
  // rows: range_start \t range_end \t AS_number \t country \t AS_description
  const rows = [];
  for (const line of tsv.split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    if (f.length < 5) continue;
    const start = ipToInt(f[0]), end = ipToInt(f[1]);
    const asn = Number(f[2]) || 0;
    const cc = f[3];
    if (start == null || end == null) continue;
    if (!/^[A-Z]{2}$/.test(cc)) continue; // skip "None"/"Unknown"
    rows.push({ start, end, asn, cc, org: f[4] || "" });
  }
  rows.sort((a, b) => a.start - b.start);
  // merge adjacent rows sharing country+asn
  const merged = [];
  for (const r of rows) {
    const last = merged[merged.length - 1];
    if (last && last.cc === r.cc && last.asn === r.asn && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const countries = [...new Set(merged.map((r) => r.cc))].sort();
  const ccIndex = new Map(countries.map((c, i) => [c, i]));
  const asnOrg = new Map();
  for (const r of merged) if (r.asn && !asnOrg.has(r.asn)) asnOrg.set(r.asn, r.org);
  const orgs = [...asnOrg.entries()].sort((a, b) => a[0] - b[0]);

  const N = merged.length;
  const enc = new TextEncoder();
  const orgBytes = orgs.map(([, org]) => enc.encode(org.slice(0, 120)));
  const orgTableSize = 4 + orgs.reduce((s, _, i) => s + 4 + 2 + orgBytes[i].length, 0);
  const size = 4 + 2 + countries.length * 2 + 4 + N * (4 + 4 + 2 + 4) + orgTableSize;
  const buf = Buffer.alloc(size);
  let o = 0;
  buf.write("GIP2", o); o += 4;
  buf.writeUInt16LE(countries.length, o); o += 2;
  for (const c of countries) { buf.write(c, o, "ascii"); o += 2; }
  buf.writeUInt32LE(N, o); o += 4;
  for (const r of merged) { buf.writeUInt32LE(r.start >>> 0, o); o += 4; }
  for (const r of merged) { buf.writeUInt32LE(r.end >>> 0, o); o += 4; }
  for (const r of merged) { buf.writeUInt16LE(ccIndex.get(r.cc), o); o += 2; }
  for (const r of merged) { buf.writeUInt32LE(r.asn >>> 0, o); o += 4; }
  buf.writeUInt32LE(orgs.length, o); o += 4;
  orgs.forEach(([asn], i) => {
    buf.writeUInt32LE(asn >>> 0, o); o += 4;
    buf.writeUInt16LE(orgBytes[i].length, o); o += 2;
    Buffer.from(orgBytes[i]).copy(buf, o); o += orgBytes[i].length;
  });
  writeFileSync(join(OUT, "geoip-country.bin"), buf);
  console.log(`geoip-country.bin: ${N} ranges, ${countries.length} countries, ${orgs.length} ASNs, ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

async function buildWorld() {
  writeFileSync(join(OUT, "world.geo.json"), await get(WORLD));
  console.log("world.geo.json written");
}

console.log("Building GeoIP assets into public/ …");
await buildGeoIP();
await buildWorld();
console.log("Done. Commit public/geoip-country.bin and public/world.geo.json.");
