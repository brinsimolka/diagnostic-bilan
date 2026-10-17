"use client";
import { useState } from "react";
import type { ExtractResult } from "@/lib/api";
import { FIELDS, parseNum, type FieldKey, type Values } from "@/lib/ratios";

type Props = {
  inputs: Record<FieldKey, string>;
  setInputs: (i: Record<FieldKey, string>) => void;
  meta: ExtractResult | null;
  onCalculate: (v: Values) => void;
};

export default function VerifyStep({ inputs, setInputs, meta, onCalculate }: Props) {
  const [error, setError] = useState("");
  const isBank = !!meta?.type_entite && String(meta.type_entite).toLowerCase().includes("banque");

  function calculate() {
    const v = Object.fromEntries(FIELDS.map((f) => [f.k, parseNum(inputs[f.k])])) as Values;
    const missing = FIELDS.filter((f) => f.req && v[f.k] == null).map((f) => f.label);
    if (missing.length) {
      setError(`Montant manquant : ${missing.join(", ")}.`);
      return;
    }
    setError("");
    onCalculate(v);
  }

  const pills = meta
    ? [
        meta.raison_sociale && { t: meta.raison_sociale },
        meta.exercice && { t: `Exercice ${meta.exercice}` },
        (meta.devise || meta.unite) && { t: [meta.devise, meta.unite].filter(Boolean).join(" · ") },
        meta.verification && { t: meta.verification },
        meta.remarques && { t: meta.remarques, warn: true },
      ].filter(Boolean) as { t: string; warn?: boolean }[]
    : [];

  return (
    <>
      <div className="step-head">
        <span className="step-num">2</span>
        <div>
          <h2>Vérifier les chiffres</h2>
          <p>Corrigez toute valeur mal lue avant de lancer le calcul. Montants dans la même unité.</p>
        </div>
      </div>
      {pills.length > 0 && (
        <div className="meta">
          {pills.map((p, i) => (
            <span key={i} className={`pill${p.warn ? " warn" : ""}`}>{p.t}</span>
          ))}
        </div>
      )}
      {isBank && (
        <div className="notice bad">
          Ce document ressemble au bilan d&apos;une banque. Les ratios ci-dessous sont conçus pour les entreprises : pour une
          banque, il faut des ratios spécifiques (solvabilité, crédits/dépôts, créances classées).
        </div>
      )}
      <div className="values">
        {FIELDS.map((f) => (
          <div key={f.k}>
            <label className="f" htmlFor={`v_${f.k}`}>{f.label}</label>
            <input
              id={`v_${f.k}`}
              type="text"
              inputMode="decimal"
              value={inputs[f.k]}
              placeholder={f.req ? "obligatoire" : "optionnel"}
              onChange={(e) => setInputs({ ...inputs, [f.k]: e.target.value })}
            />
            <div className="hint">{f.hint}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: "1.25rem" }}>
        <button className="btn" onClick={calculate}>Calculer et comparer</button>
      </div>
      <div className={`status${error ? " err" : ""}`} role="status">{error}</div>
    </>
  );
}
