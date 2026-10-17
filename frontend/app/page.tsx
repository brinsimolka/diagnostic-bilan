"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useBench } from "@/components/BenchProvider";
import UploadStep from "@/components/UploadStep";
import VerifyStep from "@/components/VerifyStep";
import Results from "@/components/Results";
import type { ExtractResult } from "@/lib/api";
import { FIELDS, parseNum, type FieldKey, type Values } from "@/lib/ratios";
import { DEFAULT_SECTOR, sectorLabel } from "@/lib/sectors";

const emptyInputs = () => Object.fromEntries(FIELDS.map((f) => [f.k, ""])) as Record<FieldKey, string>;

export default function AnalysePage() {
  const { bench, loading, error } = useBench();
  const [sector, setSector] = useState("");
  const [inputs, setInputs] = useState<Record<FieldKey, string> | null>(null);
  const [meta, setMeta] = useState<ExtractResult | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const step2 = useRef<HTMLElement>(null);
  const step3 = useRef<HTMLElement>(null);

  const sectors = useMemo(
    () => (bench ? [...bench.industries].sort((a, b) => sectorLabel(a.name).localeCompare(sectorLabel(b.name), "fr")) : []),
    [bench]
  );
  useEffect(() => {
    if (!sector && sectors.length) setSector(sectors.some((s) => s.name === DEFAULT_SECTOR) ? DEFAULT_SECTOR : sectors[0].name);
  }, [sectors, sector]);

  const scrollTo = (el: HTMLElement | null) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 50);
  };

  function onExtracted(r: ExtractResult | null) {
    const inp = emptyInputs();
    if (r) {
      const map: Record<FieldKey, string> = { ac: "actif_courant", dc: "passif_courant", dl: "passif_non_courant", cp: "capitaux_propres", ca: "chiffre_affaires", rn: "resultat_net" };
      (Object.keys(map) as FieldKey[]).forEach((k) => {
        const n = parseNum(r.valeurs[map[k]]);
        inp[k] = n == null ? "" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
      });
    }
    setInputs(inp);
    setMeta(r);
    setValues(null);
    scrollTo(step2.current);
  }

  function onCalculate(v: Values) {
    setValues(v);
    scrollTo(step3.current);
  }

  const industry = bench?.industries.find((i) => i.name === sector);

  return (
    <main>
      {!loading && !bench && (
        <div className="notice">
          Le référentiel sectoriel n&apos;a pas pu être chargé{error ? ` (${error})` : ""}. La liquidité et l&apos;endettement
          seront comparés aux normes usuelles, mais pas la rentabilité.{" "}
          <Link href="/referentiel">Importer les fichiers Damodaran</Link>
        </div>
      )}

      <UploadStep sector={sector} setSector={setSector} sectors={sectors} benchLoading={loading} onExtracted={onExtracted} />

      {inputs && (
        <section className="step" ref={step2}>
          <VerifyStep inputs={inputs} setInputs={setInputs} meta={meta} onCalculate={onCalculate} />
        </section>
      )}

      {values && (
        <section className="step" ref={step3}>
          <Results values={values} industry={industry} sector={sector} />
        </section>
      )}
    </main>
  );
}
