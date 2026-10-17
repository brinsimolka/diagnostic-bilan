"use client";
import { useMemo, useState } from "react";
import { useBench } from "@/components/BenchProvider";
import { uploadBenchmarks } from "@/lib/api";
import { fmtR, nf0 } from "@/lib/ratios";
import { sectorLabel } from "@/lib/sectors";

const FILES = [
  { name: "marginemerg.xls", desc: "Marges nettes par secteur" },
  { name: "roeemerg.xls", desc: "Rentabilité des capitaux propres" },
];
const BASE = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/";

export default function ReferentielPage() {
  const { bench, loading, error, reload, setBench } = useBench();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<{ msg: string; kind?: "ok" | "err" }>({ msg: "" });
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    if (!bench) return [];
    const s = q.trim().toLowerCase();
    return [...bench.industries]
      .sort((a, b) => sectorLabel(a.name).localeCompare(sectorLabel(b.name), "fr"))
      .filter((i) => !s || sectorLabel(i.name).toLowerCase().includes(s));
  }, [bench, q]);

  async function refresh() {
    setStatus({ msg: "" });
    await reload(true);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setStatus({ msg: "Lecture des fichiers…" });
    try {
      const b = await uploadBenchmarks([...files]);
      setBench(b);
      setStatus({ msg: `Référentiel chargé : ${b.industries.length} secteurs.`, kind: "ok" });
    } catch (e) {
      setStatus({ msg: `Import impossible : ${e instanceof Error ? e.message : e}`, kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="step">
        <div className="step-head">
          <div>
            <h2>Référentiel : Damodaran, marchés émergents</h2>
            <p>
              {bench
                ? `Source : ${bench.source} · ${bench.industries.length} secteurs · mis à jour le ${new Date(bench.fetched_at).toLocaleDateString("fr-FR")}.`
                : "Moyennes sectorielles calculées par Aswath Damodaran (NYU Stern) sur les sociétés cotées des marchés émergents, mises à jour chaque mois de janvier."}
            </p>
          </div>
        </div>

        <div className="row">
          <button className="btn" onClick={refresh} disabled={loading}>Retélécharger depuis Damodaran</button>
          {loading && <span className="muted"><span className="spin" /> Chargement…</span>}
        </div>
        {error && !loading && <div className="status err">Téléchargement automatique impossible : {error}</div>}

        <h3 style={{ margin: "1.5rem 0 .4rem", fontSize: "1.05rem" }}>Import manuel</h3>
        <p className="muted" style={{ margin: ".2rem 0" }}>
          Si le serveur n&apos;a pas accès à Internet, téléchargez ces deux fichiers et importez-les ensemble.
        </p>
        <div className="files">
          {FILES.map((f) => (
            <a key={f.name} href={BASE + f.name} target="_blank" rel="noopener noreferrer">
              {f.name}
              <span>{f.desc}</span>
            </a>
          ))}
        </div>
        <div className="row">
          <label className="btn ghost" tabIndex={0}>
            Importer les fichiers
            <input type="file" className="hidden" accept=".xls,.xlsx" multiple disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        <div className={`status${status.kind ? " " + status.kind : ""}`} role="status">{status.msg}</div>

        <h3 style={{ margin: "1.5rem 0 .6rem", fontSize: "1.05rem" }}>Moyennes par secteur</h3>
        <input type="text" className="search" placeholder="Filtrer un secteur…" aria-label="Filtrer un secteur" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Secteur</th><th>Sociétés</th><th>Marge nette</th><th>ROE</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="muted">{loading ? "Chargement…" : "Aucune donnée chargée."}</td></tr>
              )}
              {rows.map((i) => (
                <tr key={i.name}>
                  <td>{sectorLabel(i.name)}</td>
                  <td>{i.firms != null ? nf0.format(i.firms) : "—"}</td>
                  <td>{fmtR(i.net_margin, true)}</td>
                  <td>{fmtR(i.roe, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: ".88rem", marginTop: ".8rem" }}>
          Damodaran ne publie pas de ratio de liquidité générale ni d&apos;endettement (DC + DL) / CP : ces deux ratios sont
          jugés selon les normes usuelles d&apos;analyse financière.
        </p>
      </section>
    </main>
  );
}
