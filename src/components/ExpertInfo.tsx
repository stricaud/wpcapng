import { Fragment, useMemo, useState } from "react";
import type { LibpcapngModule } from "../engine";
import type { Enrich } from "../enrichment";
import {
  DEFAULT_EXPERT, EXPERT_HELP, SEVERITY_META, SEVERITY_ORDER,
  type ExpertRule, type Severity,
} from "../expert";
import { download, pickTextFile } from "../util";

interface Finding extends ExpertRule {
  packets: number[];
}

export default function ExpertInfo({
  engine,
  enrich,
  rules,
  onChange,
  onJump,
  onApplyFilter,
  onClose,
}: {
  engine: LibpcapngModule;
  enrich: Enrich;
  rules: ExpertRule[];
  onChange: (rules: ExpertRule[]) => void;
  onJump: (idx: number) => void;
  onApplyFilter: (expr: string) => void;
  onClose: () => void;
}) {
  const [showRules, setShowRules] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const commit = (next: ExpertRule[]) => onChange(next);
  const update = (id: number, patch: Partial<ExpertRule>) => commit(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const findings = useMemo<Finding[]>(() => {
    const active = rules.filter((r) => r.enabled && r.filter.trim());
    if (active.length === 0) return [];
    // enrichment rules (ip.geoip.* / tcp.analysis.*) evaluate in JS; the rest batch through WASM
    const enrichMasks = active.map((r) => (enrich.isEnrichExpr(r.filter) ? enrich.maskFor(r.filter) : null));
    const wasmIdx: number[] = [];
    active.forEach((_, k) => { if (!enrichMasks[k]) wasmIdx.push(k); });
    const wasmMasks = wasmIdx.length ? engine.matchFilters(wasmIdx.map((k) => active[k].filter)) : [];
    const masks: (Uint8Array | null)[] = active.map((_, k) => enrichMasks[k]);
    wasmIdx.forEach((k, j) => (masks[k] = wasmMasks[j]));
    return active.map((r, k) => {
      const packets: number[] = [];
      const mask = masks[k];
      if (mask) for (let i = 0; i < mask.length; i++) if (mask[i]) packets.push(i);
      return { ...r, packets };
    }).filter((f) => f.packets.length > 0);
  }, [engine, rules, enrich]);

  const validErr = (f: string) => {
    if (!f.trim()) return null;
    const res = engine.validateFilter(f);
    return res.ok ? null : res.error;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Expert Information</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="fs-toolbar">
          {SEVERITY_ORDER.map((sev) => {
            const n = findings.filter((f) => f.severity === sev).reduce((s, f) => s + f.packets.length, 0);
            return (
              <span key={sev} className="legend">
                <span className="sw" style={{ background: SEVERITY_META[sev].color, margin: "0 4px 0 8px" }} />
                {SEVERITY_META[sev].label}: {n}
              </span>
            );
          })}
          <span className="spacer" />
          <span className="dim">click a finding for details &amp; fixes</span>
          <button className="btn" onClick={() => setShowRules((s) => !s)}>{showRules ? "Hide rules" : "Edit rules"}</button>
        </div>

        <div className="table-scroll" style={{ maxHeight: "48vh" }}>
          <table className="data-table">
            <thead>
              <tr><th>Severity</th><th>Finding</th><th className="num">Count</th><th></th></tr>
            </thead>
            <tbody>
              {SEVERITY_ORDER.flatMap((sev) =>
                findings.filter((f) => f.severity === sev).map((f) => (
                  <Fragment key={f.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                      <td><span className="sw" style={{ background: SEVERITY_META[sev].color }} /> {SEVERITY_META[sev].label}</td>
                      <td>{f.name} <span className="dim mono">· {f.filter}</span></td>
                      <td className="num">{f.packets.length}</td>
                      <td><button className="btn small" onClick={(e) => { e.stopPropagation(); onApplyFilter(f.filter); }}>filter</button></td>
                    </tr>
                    {expanded === f.id && (() => {
                      const help = f.info ? { info: f.info, fix: f.fix ?? "" } : EXPERT_HELP[f.filter];
                      return (
                        <tr>
                          <td colSpan={4}>
                            {help && (
                              <div className="expert-help">
                                <div><strong>What it means.</strong> {help.info}</div>
                                {help.fix && <div style={{ marginTop: 4 }}><strong>How to fix.</strong> {help.fix}</div>}
                              </div>
                            )}
                            <div className="chip-row" style={{ marginTop: 8 }}>
                              {f.packets.slice(0, 100).map((idx) => (
                                <span key={idx} className="chip" style={{ cursor: "pointer" }} onClick={() => onJump(idx)}>#{idx + 1}</span>
                              ))}
                              {f.packets.length > 100 && <span className="dim">+{f.packets.length - 100} more</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </Fragment>
                )),
              )}
            </tbody>
          </table>
          {findings.length === 0 && <div className="pane-empty">No expert findings.</div>}
        </div>

        {showRules && (
          <>
            <h3>Rules</h3>
            <table className="io-rows">
              <thead><tr><th></th><th>Severity</th><th>Name</th><th>Display filter</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => {
                  const err = validErr(r.filter);
                  return (
                    <tr key={r.id}>
                      <td><input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} /></td>
                      <td>
                        <select className="sel" value={r.severity} onChange={(e) => update(r.id, { severity: e.target.value as Severity })}>
                          {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{SEVERITY_META[s].label}</option>)}
                        </select>
                      </td>
                      <td><input className="text-input compact" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} /></td>
                      <td><input className={`text-input compact mono${err ? " invalid" : ""}`} title={err ?? ""} value={r.filter} onChange={(e) => update(r.id, { filter: e.target.value })} /></td>
                      <td><button className="btn small" onClick={() => commit(rules.filter((x) => x.id !== r.id))}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="fs-toolbar">
              <button className="btn" onClick={() => commit([...rules, { id: Date.now(), severity: "note", name: "New", filter: "", enabled: true }])}>+ Add rule</button>
              <button className="btn" onClick={() => commit(DEFAULT_EXPERT.map((r) => ({ ...r })))}>Reset defaults</button>
              <button className="btn" onClick={() => download("expert-rules.json", JSON.stringify(rules, null, 2), "application/json")}>Export</button>
              <button className="btn" onClick={async () => {
                const text = await pickTextFile("application/json,.json");
                if (!text) return;
                try { const arr = JSON.parse(text) as ExpertRule[]; if (Array.isArray(arr)) commit(arr.map((r, i) => ({ ...r, id: r.id ?? i + 1 }))); } catch { /* ignore */ }
              }}>Import</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
