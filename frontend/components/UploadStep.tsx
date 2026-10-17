"use client";
import { useRef, useState } from "react";
import { extractBilan, type ExtractResult, type Industry } from "@/lib/api";
import { nf0 } from "@/lib/ratios";
import { sectorLabel } from "@/lib/sectors";

type Props = {
  sector: string;
  setSector: (s: string) => void;
  sectors: Industry[];
  benchLoading: boolean;
  onExtracted: (r: ExtractResult | null) => void;
};

export default function UploadStep({ sector, setSector, sectors, benchLoading, onExtracted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; kind?: "ok" | "err" }>({ msg: "" });
  const input = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setStatus({ msg: "" });
  }

  async function extract() {
    if (!file) return;
    setBusy(true);
    setStatus({ msg: "Extraction des postes du bilan… jusqu'à une minute." });
    try {
      const r = await extractBilan(file);
      onExtracted(r);
      setStatus({ msg: "Chiffres extraits. Vérifiez-les à l'étape 2.", kind: "ok" });
    } catch (e) {
      setStatus({ msg: `Extraction impossible : ${e instanceof Error ? e.message : e}. Vous pouvez saisir les montants à la main.`, kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="step">
      <div className="step-head">
        <span className="step-num">1</span>
        <div>
          <h2>Importer le bilan</h2>
          <p>Excel, CSV, PDF, photo ou scan. Vous pouvez aussi saisir les montants à la main à l&apos;étape 2.</p>
        </div>
      </div>
      <div className="grid2">
        <div>
          <label
            className={`drop${over ? " over" : ""}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                input.current?.click();
              }
            }}
            onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          >
            <strong>Déposez le fichier ici</strong>
            <span>ou cliquez pour choisir · .xlsx .xls .csv .pdf .jpg .png</span>
            <input ref={input} type="file" className="hidden" accept=".xlsx,.xls,.ods,.csv,.txt,.pdf,image/*" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {file && <div className="file-chip">{file.name} · {nf0.format(file.size / 1024)} Ko</div>}
        </div>
        <div>
          <div className="field">
            <label className="f" htmlFor="secteur">Secteur d&apos;activité (classification Damodaran)</label>
            <select id="secteur" value={sector} onChange={(e) => setSector(e.target.value)} disabled={!sectors.length}>
              {!sectors.length && <option value="">{benchLoading ? "Chargement du référentiel…" : "Référentiel non disponible"}</option>}
              {sectors.map((s) => (
                <option key={s.name} value={s.name}>{sectorLabel(s.name)}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <button className="btn" onClick={extract} disabled={!file || busy}>Extraire les chiffres</button>
            <button className="btn ghost" onClick={() => onExtracted(null)}>Saisir à la main</button>
          </div>
        </div>
      </div>
      <div className={`status${status.kind ? " " + status.kind : ""}`} role="status">
        {busy && <span className="spin" />} {status.msg}
      </div>
    </section>
  );
}
