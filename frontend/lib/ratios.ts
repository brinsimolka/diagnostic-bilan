// Calcul des ratios, comparaison au référentiel et règles d'interprétation.
// Les verdicts sont déterministes : l'IA ne fait que les rédiger.

import type { Industry } from "./api";

export type Values = {
  ac: number | null; // actif courant
  dc: number | null; // dettes court terme (passifs courants)
  dl: number | null; // dettes long terme (passifs non courants)
  cp: number | null; // capitaux propres
  ca: number | null; // chiffre d'affaires
  rn: number | null; // résultat net
};
export type FieldKey = keyof Values;

export const FIELDS: { k: FieldKey; label: string; hint: string; req?: boolean }[] = [
  { k: "ac", label: "Actif courant (AC)", hint: "Total des actifs courants", req: true },
  { k: "dc", label: "Dettes à court terme (DC)", hint: "Total des passifs courants", req: true },
  { k: "dl", label: "Dettes à long terme (DL)", hint: "Total des passifs non courants", req: true },
  { k: "cp", label: "Capitaux propres (CP)", hint: "Après résultat de l'exercice", req: true },
  { k: "ca", label: "Chiffre d'affaires (CA)", hint: "Revenus / ventes de l'exercice", req: true },
  { k: "rn", label: "Résultat net", hint: "Négatif si perte", req: true },
];

type RefField = "net_margin" | "roe";
export type RatioDef = {
  key: string;
  name: string;
  formula: string;
  dir: 1 | -1; // 1 : plus haut = mieux ; -1 : plus bas = mieux
  pct: boolean;
  ref: "norme" | "secteur";
  norm?: [number, number];
  normTxt?: string;
  field?: RefField;
  calc: (v: Values) => number | null;
};

const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
const sum = (...a: (number | null)[]) => (a.some((x) => x == null) ? null : (a as number[]).reduce((s, x) => s + x, 0));
const cpOk = (v: Values) => !(v.cp != null && v.cp <= 0);

export const RATIOS: RatioDef[] = [
  { key: "liquidite_generale", name: "Ratio de liquidité générale", formula: "AC / DC", dir: 1, pct: false, ref: "norme", norm: [1, 1.5], normTxt: "Norme usuelle : ≥ 1,5 confortable, < 1 risque", calc: (v) => div(v.ac, v.dc) },
  { key: "endettement", name: "Ratio d'endettement", formula: "(DC + DL) / CP", dir: -1, pct: false, ref: "norme", norm: [1, 2], normTxt: "Norme usuelle : ≤ 1 sain, > 2 élevé", calc: (v) => (cpOk(v) ? div(sum(v.dc, v.dl), v.cp) : null) },
  { key: "rentabilite_nette", name: "Rentabilité nette", formula: "Résultat net / CA", dir: 1, pct: true, ref: "secteur", field: "net_margin", calc: (v) => div(v.rn, v.ca) },
  { key: "roe", name: "Rentabilité financière (ROE)", formula: "Résultat net / CP", dir: 1, pct: true, ref: "secteur", field: "roe", calc: (v) => (cpOk(v) ? div(v.rn, v.cp) : null) },
];

export type Thresholds = { t1: number; t2: number; refVal: number; refLabel: string };

export function sectorRefs(ind: Industry | undefined) {
  if (!ind) return null;
  return { net_margin: ind.net_margin, roe: ind.roe, firms: ind.firms };
}

export function thresholds(R: RatioDef, refs: ReturnType<typeof sectorRefs>): Thresholds | null {
  if (R.ref === "norme" && R.norm) return { t1: R.norm[0], t2: R.norm[1], refVal: R.dir > 0 ? R.norm[1] : R.norm[0], refLabel: "norme" };
  const avg = refs && R.field ? refs[R.field] : null;
  if (avg == null) return null;
  return avg > 0 ? { t1: 0.75 * avg, t2: avg, refVal: avg, refLabel: "moyenne" } : { t1: avg, t2: avg, refVal: avg, refLabel: "moyenne" };
}

// 0 = défavorable, 1 = intermédiaire, 2 = favorable
export type Pos = 0 | 1 | 2;
export function position(v: number | null, th: Thresholds | null, dir: 1 | -1): Pos | null {
  if (v == null || !th) return null;
  if (dir > 0) return v < th.t1 ? 0 : v < th.t2 ? 1 : 2;
  return v <= th.t1 ? 2 : v <= th.t2 ? 1 : 0;
}

export const TONE: Record<Pos, "bad" | "mid" | "good"> = { 0: "bad", 1: "mid", 2: "good" };

export function verdictLabel(R: RatioDef, pos: Pos): string {
  if (R.ref === "norme") return ["Hors norme", "À surveiller", "Conforme à la norme"][pos];
  return ["Nettement en dessous du secteur", "Légèrement en dessous du secteur", "Au niveau ou au-dessus du secteur"][pos];
}

export function interpret(key: string, val: number | null, pos: Pos | null, v: Values): { text: string; reco: string[] } {
  const t = { text: "", reco: [] as string[] };
  if (val == null) {
    if (v.cp != null && v.cp <= 0 && ["endettement", "roe"].includes(key))
      t.text = "Capitaux propres nuls ou négatifs : ce ratio n'a pas de sens. La situation nette est à reconstituer en priorité.";
    else t.text = "Calcul impossible avec les montants saisis.";
    return t;
  }
  const weak = pos === 0, mid = pos === 1;
  switch (key) {
    case "liquidite_generale":
      if (val < 1) t.text = "L'actif courant ne couvre pas les dettes à court terme : le fonds de roulement est négatif et l'entreprise dépend de ses banques ou fournisseurs pour honorer ses échéances.";
      else if (val > 3) t.text = "Liquidité très élevée, peut-être excessive : trésorerie ou stocks possiblement sous-employés.";
      else t.text = mid ? "Les dettes à court terme sont couvertes, avec une marge de sécurité limitée." : "Bonne capacité à faire face aux échéances à court terme.";
      if (val < 1) t.reco = ["Négocier des délais fournisseurs plus longs et accélérer le recouvrement clients.", "Consolider une partie des crédits de gestion en crédit à moyen terme.", "Envisager un apport en fonds propres ou en compte courant d'associés."];
      else if (val > 3) t.reco = ["Placer la trésorerie excédentaire ou l'affecter à l'investissement.", "Vérifier que les stocks ne sont pas surdimensionnés."];
      break;
    case "endettement":
      t.text = weak ? "Endettement global élevé : chaque dinar de fonds propres porte plus de deux dinars de dettes, ce qui réduit la capacité à obtenir de nouveaux crédits." : mid ? "Endettement global modéré, à surveiller." : "Structure financière saine.";
      if (weak) t.reco = ["Renforcer les fonds propres : augmentation de capital, mise en réserve des bénéfices.", "Rééchelonner la dette et éviter les nouveaux emprunts non productifs."];
      break;
    case "rentabilite_nette":
      if (val < 0) t.text = "L'exercice est déficitaire : l'activité ne couvre pas l'ensemble de ses charges.";
      else t.text = weak ? "Marge nette nettement inférieure à la moyenne du secteur : les charges absorbent une part importante du chiffre d'affaires." : mid ? "Marge nette proche mais en dessous de la moyenne sectorielle." : "Marge nette au niveau ou au-dessus de la moyenne du secteur.";
      if (val < 0 || weak) t.reco = ["Analyser la structure des coûts (achats, personnel, charges financières).", "Revoir la politique de prix et le mix produits vers les activités les plus rentables.", "Réduire les charges financières en renégociant les taux."];
      break;
    case "roe":
      if (val < 0) t.text = "Rentabilité des fonds propres négative : les associés perdent de la valeur sur cet exercice.";
      else t.text = weak ? "Les fonds propres sont nettement moins rémunérés que dans le secteur." : mid ? "Rentabilité des capitaux propres un peu en dessous du secteur." : "Rentabilité des capitaux propres au niveau ou au-dessus du secteur.";
      if (val < 0 || weak) t.reco = ["Améliorer d'abord la marge nette, principal levier du ROE.", "Vérifier que les actifs immobilisés sont productifs ; céder ceux qui ne le sont pas."];
      break;
  }
  return t;
}

export type RatioResult = {
  def: RatioDef;
  value: number | null;
  th: Thresholds | null;
  pos: Pos | null;
  text: string;
  reco: string[];
};

export function computeAll(v: Values, ind: Industry | undefined): RatioResult[] {
  const refs = sectorRefs(ind);
  return RATIOS.map((R) => {
    const value = R.calc(v);
    const th = thresholds(R, refs);
    const pos = position(value, th, R.dir);
    return { def: R, value, th, pos, ...interpret(R.key, value, pos, v) };
  });
}

/* ---------- Formatage ---------- */
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export const fmtNum = (x: number | null) => (x == null ? "" : nf.format(x));
export const fmtR = (x: number | null | undefined, pct: boolean) => (x == null ? "—" : pct ? `${nf.format(x * 100)} %` : nf.format(x));

export function parseNum(s: unknown): number | null {
  if (s == null) return null;
  if (typeof s === "number") return isFinite(s) ? s : null;
  let t = String(s).trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[\s\u00A0\u202F]/g, "").replace(/[^\d.,\-]/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
  if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (lc > -1) t = t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (ld > -1 && t.split(".").length > 2) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}
