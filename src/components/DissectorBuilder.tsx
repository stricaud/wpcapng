import { useMemo, useState } from "react";
import type { Field, LibpcapngModule } from "../engine";
import { loadStored, saveStored, type StoredPosa } from "../posaStore";

type TKind = "fixed" | "sized" | "cstring" | "ref";
interface TType { key: string; label: string; size: number; kind: TKind; int?: boolean }

const TYPES: TType[] = [
  { key: "uint8", label: "uint8 (1)", size: 1, kind: "fixed", int: true },
  { key: "uint16", label: "uint16 BE (2)", size: 2, kind: "fixed", int: true },
  { key: "uint24", label: "uint24 BE (3)", size: 3, kind: "fixed", int: true },
  { key: "uint32", label: "uint32 BE (4)", size: 4, kind: "fixed", int: true },
  { key: "uint64", label: "uint64 BE (8)", size: 8, kind: "fixed", int: true },
  { key: "le_uint16", label: "uint16 LE (2)", size: 2, kind: "fixed", int: true },
  { key: "le_uint32", label: "uint32 LE (4)", size: 4, kind: "fixed", int: true },
  { key: "le_uint64", label: "uint64 LE (8)", size: 8, kind: "fixed", int: true },
  { key: "mac", label: "mac (6)", size: 6, kind: "fixed" },
  { key: "ip4", label: "ip4 (4)", size: 4, kind: "fixed" },
  { key: "ip6", label: "ip6 (16)", size: 16, kind: "fixed" },
  { key: "bytes", label: "bytes<N>", size: 0, kind: "sized" },
  { key: "str", label: "str<N>", size: 0, kind: "sized" },
  { key: "cstring", label: "cstring (until NUL)", size: 0, kind: "cstring" },
  { key: "bytes_ref", label: "bytes[len field]", size: 0, kind: "ref" },
  { key: "str_ref", label: "str[len field]", size: 0, kind: "ref" },
];
const TT = (k: string) => TYPES.find((t) => t.key === k)!;

interface Enum { name: string; value: string }
interface Guard { ref: string; op: string; value: string }
interface BField { name: string; type: string; n: number; label: string; ref?: string; enums: Enum[]; value?: number; guard?: Guard }

const OPS = ["==", "!=", "<", ">", ">=", "<="];
function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case "==": return a === b;
    case "!=": return a !== b;
    case "<": return a < b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    default: return false;
  }
}

const hx = (b: number) => b.toString(16).padStart(2, "0");

function analyze(layers: Field[] | null): { dataOff: number; dataLen: number; proto: "tcp" | "udp" | null; port: number } {
  let dataOff = 0, dataLen = 0, proto: "tcp" | "udp" | null = null, port = 0;
  const walk = (f: Field) => {
    if (f.abbrev === "data" && f.len > dataLen) { dataOff = f.off; dataLen = f.len; }
    if (f.abbrev === "tcp") proto = "tcp";
    if (f.abbrev === "udp") proto = "udp";
    if (f.abbrev === "tcp.dstport" || f.abbrev === "udp.dstport") port = Number(f.value) || port;
    f.children.forEach(walk);
  };
  (layers ?? []).forEach(walk);
  return { dataOff, dataLen, proto, port };
}

function intVal(bytes: Uint8Array, type: string): number {
  const le = type.startsWith("le_");
  let v = 0;
  if (le) for (let i = bytes.length - 1; i >= 0; i--) v = v * 256 + bytes[i];
  else for (let i = 0; i < bytes.length; i++) v = v * 256 + bytes[i];
  return v;
}

function preview(bytes: Uint8Array, type: string): string {
  const t = TT(type);
  if (t.int) return String(intVal(bytes, type));
  if (type === "mac") return Array.from(bytes, hx).join(":");
  if (type === "ip4") return Array.from(bytes).join(".");
  if (type === "str" || type === "str_ref" || type === "cstring")
    return new TextDecoder("latin1").decode(bytes).replace(/[^\x20-\x7e]/g, ".");
  return Array.from(bytes, hx).join(" ");
}

export default function DissectorBuilder({
  engine,
  index,
  onClose,
  onSaved,
}: {
  engine: LibpcapngModule;
  index: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const packet = useMemo(() => engine.getPacketBytes(index) ?? new Uint8Array(), [engine, index]);
  const info = useMemo(() => analyze(engine.getDetail(index)), [engine, index]);
  const payload = useMemo(
    () => (info.dataLen > 0 ? packet.subarray(info.dataOff, info.dataOff + info.dataLen) : packet),
    [packet, info],
  );

  const [name, setName] = useState("MYPROTO");
  const [display, setDisplay] = useState("MyProto");
  const [abbrev, setAbbrev] = useState("myproto");
  const [proto, setProto] = useState<"tcp" | "udp">(info.proto ?? "tcp");
  const [port, setPort] = useState(info.port || 0);
  const [fields, setFields] = useState<BField[]>([]);

  const [type, setType] = useState("uint8");
  const [n, setN] = useState(1);
  const [ref, setRef] = useState("");
  const [fname, setFname] = useState("field1");
  const [flabel, setFlabel] = useState("");
  const [enums, setEnums] = useState<Enum[]>([]);
  const [enName, setEnName] = useState("");
  const [enVal, setEnVal] = useState("");
  const [guardRef, setGuardRef] = useState("");
  const [guardOp, setGuardOp] = useState("==");
  const [guardVal, setGuardVal] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const consumed = fields.reduce((s, f) => s + f.n, 0);
  const remaining = Math.max(0, payload.length - consumed);
  const t = TT(type);
  const intFields = fields.filter((f) => TT(f.type).int);

  // Does the draft's `when` guard hold for this example packet?
  const guardActive = guardRef !== "" && guardVal !== "";
  const guardHolds = (() => {
    if (!guardActive) return true;
    const rv = fields.find((f) => f.name === guardRef)?.value;
    return rv != null && cmp(rv, guardOp, Number(guardVal));
  })();

  // Concrete size of the draft field against this example packet.
  const baseSize = (() => {
    if (t.size) return t.size;
    if (t.kind === "sized") return Math.max(1, Math.min(n, remaining));
    if (t.kind === "cstring") {
      let k = consumed;
      while (k < payload.length && payload[k] !== 0) k++;
      return Math.min(remaining, k < payload.length ? k - consumed + 1 : remaining);
    }
    if (t.kind === "ref") {
      const rv = fields.find((f) => f.name === ref)?.value ?? 0;
      return Math.min(remaining, rv);
    }
    return 0;
  })();
  const draftSize = guardActive && !guardHolds ? 0 : baseSize;
  const draftBytes = payload.subarray(consumed, consumed + draftSize);

  const addField = () => {
    if (remaining <= 0) return;
    if (t.kind === "ref" && !ref) { setMsg({ ok: false, text: "Pick a length field for the ref type." }); return; }
    const nm = fname.replace(/[^A-Za-z0-9_]/g, "_") || `field${fields.length + 1}`;
    const f: BField = {
      name: nm, type, n: draftSize, label: flabel, ref: t.kind === "ref" ? ref : undefined,
      enums: t.int ? enums : [], value: t.int && draftSize > 0 ? intVal(draftBytes, type) : undefined,
      guard: guardActive ? { ref: guardRef, op: guardOp, value: guardVal } : undefined,
    };
    setFields((fs) => [...fs, f]);
    setFname(`field${fields.length + 2}`);
    setFlabel(""); setEnums([]); setEnName(""); setEnVal("");
    setGuardRef(""); setGuardVal(""); setMsg(null);
  };

  const source = useMemo(() => {
    const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
    const N = safe(name) || "MYPROTO";
    const posaType = (f: BField) =>
      f.type === "bytes" ? `bytes<${f.n}>`
      : f.type === "str" ? `str<${f.n}>`
      : f.type === "bytes_ref" ? `bytes[${f.ref}]`
      : f.type === "str_ref" ? `str[${f.ref}]`
      : f.type;
    const lines = [`Object<main> ${N}`, `    col "${display || N}"`, `    abbrev "${abbrev || N.toLowerCase()}"`];
    for (const f of fields) {
      const ind = f.guard ? "        " : "    ";
      if (f.guard) lines.push(`    when ${safe(f.guard.ref)} ${f.guard.op} ${f.guard.value}:`);
      lines.push(`${ind}required ${posaType(f)} ${safe(f.name)}${f.label ? ` "${f.label}"` : ""}`);
      for (const e of f.enums) if (e.name.trim()) lines.push(`${ind}    ${safe(e.name)} = ${e.value}`);
    }
    if (port > 0) lines.push(`rule ${proto}.port == ${port} => ${N}`);
    return lines.join("\n") + "\n";
  }, [name, display, abbrev, fields, proto, port]);

  const saveLoad = () => {
    const res = engine.loadPosaText(source);
    if (!res.ok) { setMsg({ ok: false, text: res.error || "parse error" }); return; }
    const item: StoredPosa = { id: `${name}-${port}`, name: `${display || name} (${proto}/${port})`, source };
    const stored = loadStored().filter((s) => s.id !== item.id);
    saveStored([...stored, item]);
    setMsg({ ok: true, text: `Loaded ${res.added} protocol(s) and saved.` });
    onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Build Dissector <span className="dim" style={{ fontSize: 13, fontWeight: 400 }}>from packet #{index + 1}</span></h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        {payload.length === 0 ? (
          <p className="dim">This packet has no payload bytes to describe.</p>
        ) : (
          <>
            <h3>Payload ({payload.length} bytes) — grey = mapped, amber = next field</h3>
            <div className="fs-body" style={{ maxHeight: 150 }}>
              {Array.from(payload, (b, i) => (
                <span key={i} className={i < consumed ? "db-done" : i < consumed + draftSize ? "db-next" : ""}>
                  {hx(b)}{" "}
                </span>
              ))}
            </div>

            <h3>Add next field</h3>
            <div className="fs-toolbar" style={{ flexWrap: "wrap" }}>
              <input className="text-input compact" style={{ width: 130 }} placeholder="field name" value={fname} onChange={(e) => setFname(e.target.value)} />
              <select className="sel" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((tt) => <option key={tt.key} value={tt.key}>{tt.label}</option>)}
              </select>
              {t.kind === "sized" && (
                <input className="text-input compact" style={{ width: 64 }} type="number" min={1} max={remaining} value={n} onChange={(e) => setN(Number(e.target.value))} />
              )}
              {t.kind === "ref" && (
                <select className="sel" value={ref} onChange={(e) => setRef(e.target.value)}>
                  <option value="">length field…</option>
                  {intFields.map((f) => <option key={f.name} value={f.name}>{f.name} = {f.value}</option>)}
                </select>
              )}
              <input className="text-input compact" style={{ width: 150 }} placeholder="label (optional)" value={flabel} onChange={(e) => setFlabel(e.target.value)} />
              <span className="dim mono">= {preview(draftBytes, type)} ({draftSize}B)</span>
              <button className="btn" onClick={addField} disabled={remaining <= 0}>Add field</button>
              <span className="dim">{remaining} left</span>
            </div>

            {t.int && (
              <div className="fs-toolbar" style={{ flexWrap: "wrap" }}>
                <span className="dim">Enum values:</span>
                {enums.map((e, i) => (
                  <span key={i} className="chip">
                    {e.name}={e.value}
                    <button className="btn small" style={{ marginLeft: 4 }} onClick={() => setEnums((es) => es.filter((_, k) => k !== i))}>✕</button>
                  </span>
                ))}
                <input className="text-input compact" style={{ width: 110 }} placeholder="name" value={enName} onChange={(e) => setEnName(e.target.value)} />
                <input className="text-input compact" style={{ width: 70 }} placeholder="value" value={enVal} onChange={(e) => setEnVal(e.target.value)} />
                <button className="btn small" disabled={!enName.trim() || !enVal.trim()} onClick={() => { setEnums((es) => [...es, { name: enName, value: enVal }]); setEnName(""); setEnVal(""); }}>+ enum</button>
              </div>
            )}

            {intFields.length > 0 && (
              <div className="fs-toolbar" style={{ flexWrap: "wrap" }}>
                <span className="dim">Only when (optional):</span>
                <select className="sel" value={guardRef} onChange={(e) => setGuardRef(e.target.value)}>
                  <option value="">— always —</option>
                  {intFields.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
                {guardActive && (
                  <>
                    <select className="sel" value={guardOp} onChange={(e) => setGuardOp(e.target.value)}>
                      {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <input className="text-input compact" style={{ width: 70 }} placeholder="value" value={guardVal} onChange={(e) => setGuardVal(e.target.value)} />
                    <span className="dim">{guardHolds ? "holds for this packet" : "false here → 0 bytes"}</span>
                  </>
                )}
              </div>
            )}

            {fields.length > 0 && (
              <table className="io-rows">
                <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Bytes</th><th>When</th><th>Label</th><th></th></tr></thead>
                <tbody>
                  {fields.map((f, i) => (
                    <tr key={i}>
                      <td className="dim">{i + 1}</td>
                      <td className="mono">{f.name}{f.enums.length ? ` {${f.enums.length}}` : ""}</td>
                      <td className="mono">{f.type === "bytes_ref" ? `bytes[${f.ref}]` : f.type === "str_ref" ? `str[${f.ref}]` : f.type === "bytes" || f.type === "str" ? `${f.type}<${f.n}>` : f.type}</td>
                      <td className="num">{f.n}</td>
                      <td className="mono dim">{f.guard ? `${f.guard.ref} ${f.guard.op} ${f.guard.value}` : ""}</td>
                      <td>{f.label}</td>
                      <td><button className="btn small" onClick={() => setFields((fs) => fs.filter((_, k) => k !== i))}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>Protocol</h3>
            <div className="fs-toolbar" style={{ flexWrap: "wrap" }}>
              <input className="text-input compact" style={{ width: 120 }} placeholder="NAME" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="text-input compact" style={{ width: 120 }} placeholder="Column" value={display} onChange={(e) => setDisplay(e.target.value)} />
              <input className="text-input compact mono" style={{ width: 100 }} placeholder="abbrev" value={abbrev} onChange={(e) => setAbbrev(e.target.value)} />
              <span className="dim">bind</span>
              <select className="sel" value={proto} onChange={(e) => setProto(e.target.value as "tcp" | "udp")}>
                <option value="tcp">tcp.port</option>
                <option value="udp">udp.port</option>
              </select>
              <input className="text-input compact" style={{ width: 84 }} type="number" placeholder="port" value={port || ""} onChange={(e) => setPort(Number(e.target.value))} />
            </div>

            <h3>Generated .posa</h3>
            <pre className="fs-body" style={{ maxHeight: 150 }}>{source}</pre>

            {msg && <div className={msg.ok ? "note ok" : "note err"}>{msg.text}</div>}
            <div className="fs-toolbar">
              <span className="dim">Saved to your browser and applied to the whole capture.</span>
              <span className="spacer" />
              <button className="btn primary" onClick={saveLoad} disabled={fields.length === 0}>Load &amp; Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
