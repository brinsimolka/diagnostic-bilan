// Appels au backend FastAPI (proxifiés par Next.js via /api/*)

export type Industry = {
  name: string;
  firms: number | null;
  net_margin: number | null;
  roe: number | null;
};

export type Benchmarks = {
  source: string;
  region: string;
  fetched_at: string;
  files: Record<string, string>;
  industries: Industry[];
};

export type ExtractResult = {
  type_entite?: string;
  raison_sociale?: string | null;
  exercice?: string | null;
  devise?: string | null;
  unite?: string | null;
  verification?: string | null;
  remarques?: string | null;
  valeurs: Record<string, number | string | null>;
};

export type AiAnalysis = {
  synthese?: string;
  note_globale?: string;
  points_forts?: string[];
  points_vigilance?: string[];
  recommandations?: { action: string; priorite?: string; impact_attendu?: string }[];
  avis_credit?: string;
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail;
    } catch {}
    throw new Error(detail || `Erreur serveur ${res.status}`);
  }
  return res.json();
}

export async function getBenchmarks(refresh = false): Promise<Benchmarks> {
  return handle(await fetch(`/api/benchmarks?region=emerg${refresh ? "&refresh=true" : ""}`));
}

export async function uploadBenchmarks(files: File[]): Promise<Benchmarks> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return handle(await fetch("/api/benchmarks/upload", { method: "POST", body: fd }));
}

export async function extractBilan(file: File): Promise<ExtractResult> {
  const fd = new FormData();
  fd.append("file", file);
  return handle(await fetch("/api/extract", { method: "POST", body: fd }));
}

export async function analyse(payload: unknown): Promise<AiAnalysis> {
  return handle(
    await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload, (_k, x) => (typeof x === "number" ? +x.toFixed(4) : x)),
    })
  );
}
