"use client";
import { useMemo, useState } from "react";
import { analyse, type AiAnalysis, type Industry } from "@/lib/api";
import { computeAll, fmtR, nf0, TONE, verdictLabel, type RatioDef, type Thresholds, type Values } from "@/lib/ratios";
import { sectorLabel } from "@/lib/sectors";

type Props = { values: Values; industry: Industry | undefined; sector: string };

export default function Results({ values, industry, sector }: Props) {
  const results = useMemo(() => computeAll(values, industry), [values, industry]);
  const [ai, setAi] = useState<AiAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const alerts: string[] = [];
  if (values.cp != null && values.cp <= 0)
    alerts.push("Capitaux propres nuls ou négatifs : situation nette à reconstituer. Si les capitaux propres deviennent inférieurs à la moitié du capital, la loi impose de consulter l'assemblée sur la continuité de l'activité.");
  if (values.rn != null && values.rn < 0) alerts.push("L'exercice se solde par une perte.");

  async function runAi() {
    setBusy(true);
    setErr("");
    setAi(null);
    try {
      setAi(
        await analyse({
          secteur: sector ? sectorLabel(sector) : null,
          source_benchmark: "Damodaran, NYU Stern — All Emerging Markets (moyennes sectorielles, sociétés cotées)",
          valeurs: values,
          ratios: results.map((r) => ({
            ratio: r.def.name,
            valeur: r.value,
            reference: r.def.ref === "norme" ? r.def.normTxt : r.th ? `moyenne sectorielle ${fmtR(r.th.refVal, r.def.pct)}` : "non disponible",
            sens: r.def.dir > 0 ? "plus haut = mieux" : "plus bas = mieux",
            verdict: r.pos == null ? "non évalué" : verdictLabel(r.def, r.pos),
          })),
        })
      );
    } catch (e) {
      setErr(`Analyse impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="step-head">
        <span className="step-num">3</span>
        <div>
          <h2>Résultats et interprétation</h2>
          <p>
            {industry
              ? `Rentabilité nette et ROE comparés à la moyenne du secteur « ${sectorLabel(industry.name)} » (${industry.firms ? nf0.format(industry.firms) + " sociétés cotées, " : ""}marchés émergents, Damodaran). Liquidité et endettement comparés aux normes usuelles.`
              : "Référentiel sectoriel non chargé : seuls les ratios à norme usuelle sont jugés."}
          </p>
        </div>
      </div>

      {alerts.map((a) => (
        <div key={a} className="notice bad">{a}</div>
      ))}

      {results.map((r) => {
        const tone = r.pos == null ? null : TONE[r.pos];
        const color = tone ? `var(--${tone})` : "var(--muted)";
        const refTxt = r.def.ref === "norme" ? r.def.normTxt : r.th ? `Moyenne du secteur (marchés émergents) : ${fmtR(r.th.refVal, r.def.pct)}` : "Moyenne sectorielle indisponible";
        return (
          <div className="ratio" key={r.def.key}>
            <div>
              <h3>{r.def.name}</h3>
              <div className="formula">{r.def.formula}</div>
              <div className="val">{fmtR(r.value, r.def.pct)}</div>
              {r.pos == null ? (
                <span className="tag na">{r.value == null ? "Non calculable" : "Pas de référence"}</span>
              ) : (
                <span className={`tag ${tone}`}>{verdictLabel(r.def, r.pos)}</span>
              )}
            </div>
            <div>
              {r.th && <Gauge value={r.value} th={r.th} def={r.def} color={color} />}
              <div className="src">{refTxt}</div>
              <p className="interp">{r.text}</p>
              {r.reco.length > 0 && (
                <ul className="reco">
                  {r.reco.map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: "1rem", borderTop: "1px solid var(--line)", paddingTop: "1.25rem" }}>
        <button className="btn" onClick={runAi} disabled={busy}>Rédiger l&apos;analyse complète</button>
        <span className="muted" style={{ fontSize: ".9rem" }}>Synthèse et plan d&apos;action rédigés à partir des ratios et du référentiel.</span>
      </div>
      <div className={`status${err ? " err" : ""}`} role="status">
        {busy && (<><span className="spin" /> Rédaction de l&apos;analyse… (30 à 60 secondes)</>)}
        {err}
      </div>
      {ai && <AiPanel ai={ai} />}
    </>
  );
}

function Gauge({ value, th, def, color }: { value: number | null; th: Thresholds; def: RatioDef; color: string }) {
  const span = Math.max(Math.abs(th.t2), Math.abs(th.t1), def.pct ? 0.05 : 0.5);
  let lo = Math.min(0, th.t1 - span * 0.6);
  let hi = Math.max(th.t2 + span * 0.9, span * 1.6);
  if (value != null) {
    lo = Math.min(lo, value - span * 0.15);
    hi = Math.max(hi, value + span * 0.15);
  }
  const p = (x: number) => ((x - lo) / (hi - lo)) * 100;
  const clamp = (x: number) => `${Math.min(95, Math.max(5, p(x)))}%`;
  const zone = (a: number, b: number, c: string) => (
    <div className={`zone ${c}`} style={{ left: `${p(a)}%`, width: `${Math.max(0, p(b) - p(a))}%` }} />
  );
  return (
    <div className="gauge" aria-label="Position par rapport à la référence">
      <div className="track" />
      {def.dir > 0 ? (<>{zone(lo, th.t1, "zb")}{zone(th.t1, th.t2, "zm")}{zone(th.t2, hi, "zg")}</>) : (<>{zone(lo, th.t1, "zg")}{zone(th.t1, th.t2, "zm")}{zone(th.t2, hi, "zb")}</>)}
      <div className="med" style={{ left: `${p(th.refVal)}%` }} />
      {value != null && (
        <>
          <div className="mark" style={{ left: `${p(value)}%`, color }} />
          <div className="you" style={{ left: clamp(value), color }}>Vous</div>
        </>
      )}
      <div className="lbl" style={{ left: clamp(th.refVal) }}>{th.refLabel} {fmtR(th.refVal, def.pct)}</div>
    </div>
  );
}

function AiPanel({ ai }: { ai: AiAnalysis }) {
  const list = (a?: string[]) => (a && a.length ? <ul>{a.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="muted">Aucun.</p>);
  const prio = (p?: string) => {
    const s = String(p || "").toLowerCase();
    return s.startsWith("h") ? "haute" : s.startsWith("b") ? "basse" : "moyenne";
  };
  return (
    <div className="ai">
      <h3>Synthèse{ai.note_globale ? ` · ${ai.note_globale}` : ""}</h3>
      <p>{ai.synthese}</p>
      <h3>Points forts</h3>
      {list(ai.points_forts)}
      <h3>Points de vigilance</h3>
      {list(ai.points_vigilance)}
      <h3>Plan d&apos;action</h3>
      <ul>
        {(ai.recommandations || []).map((r, i) => (
          <li key={i}>
            <span className={`prio ${prio(r.priorite)}`}>{prio(r.priorite)}</span>
            {r.action}
            {r.impact_attendu && <span className="muted"> — {r.impact_attendu}</span>}
          </li>
        ))}
      </ul>
      {ai.avis_credit && (<><h3>Lecture bancaire</h3><p>{ai.avis_credit}</p></>)}
    </div>
  );
}
