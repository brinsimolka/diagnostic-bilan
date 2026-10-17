# Diagnostic de bilan

Application web qui lit un bilan (Excel, CSV, PDF texte ou scanné, photo), en extrait les postes clés, calcule quatre ratios financiers, les compare aux moyennes sectorielles des marchés émergents (Damodaran, NYU Stern) et rédige une interprétation avec recommandations.

## Architecture

| Partie | Technologie | Port |
|---|---|---|
| Frontend | Next.js 14 (React 18, TypeScript) | 3000 |
| Backend | Python, FastAPI | 8000 |
| IA | Google Gemini (gratuit) ou Claude (payant), au choix | — |

Le navigateur ne parle qu'au frontend. Next.js transmet toutes les requêtes `/api/*` au backend (voir `frontend/next.config.mjs`), donc la clé API reste sur le serveur.

```
diagnostic-bilan/
├── backend/
│   ├── main.py              API : extraction, analyse, référentiel
│   ├── damodaran.py         téléchargement et lecture des fichiers Damodaran
│   ├── llm.py               fournisseur d'IA (Gemini ou Claude)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       mise en page commune et navigation
│   │   ├── page.tsx         page Analyse (étapes 1 à 3)
│   │   ├── referentiel/page.tsx   page Référentiel
│   │   └── globals.css      styles (clair et sombre)
│   ├── components/
│   │   ├── BenchProvider.tsx   chargement du référentiel, partagé entre les pages
│   │   ├── Nav.tsx
│   │   ├── UploadStep.tsx      étape 1 : import du bilan
│   │   ├── VerifyStep.tsx      étape 2 : vérification des montants
│   │   └── Results.tsx         étape 3 : ratios, jauges, analyse rédigée
│   ├── lib/
│   │   ├── api.ts           appels au backend et types
│   │   ├── ratios.ts        formules, seuils, verdicts, interprétations
│   │   └── sectors.ts       traduction française des secteurs
│   ├── package.json
│   └── .env.local.example
└── data/                    cache du référentiel (créé automatiquement)
```

## Installation

Prérequis : Python 3.10+, Node.js 18.17+ et une clé API d'IA.

**Clé gratuite (recommandé pour commencer) : Google Gemini**
1. Allez sur https://aistudio.google.com/apikey et connectez-vous avec un compte Google.
2. Cliquez sur « Create API key » et copiez la clé. Aucune carte bancaire n'est demandée.
3. Collez-la dans `backend/.env` : `GEMINI_API_KEY=...` (avec `LLM_PROVIDER=gemini`).

Le niveau gratuit est limité en nombre de requêtes par minute et par jour, ce qui suffit pour tester. Attention : sur le niveau gratuit, Google peut utiliser les données envoyées pour améliorer ses modèles. N'y envoyez pas de bilans confidentiels de vrais clients.

**Option payante : Claude (Anthropic)** — mettez `LLM_PROVIDER=anthropic` et `ANTHROPIC_API_KEY=...` (clé sur https://platform.claude.com, crédits prépayés).

**1. Backend** (terminal 1)

```bash
cd diagnostic-bilan/backend
python -m venv venv
source venv/bin/activate          # Windows : venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # puis collez votre clé dans GEMINI_API_KEY
uvicorn main:app --reload --port 8000
```

**2. Frontend** (terminal 2)

```bash
cd diagnostic-bilan/frontend
npm install
cp .env.local.example .env.local  # BACKEND_URL=http://localhost:8000
npm run dev
```

Ouvrez http://localhost:3000.

Pour la production : `npm run build` puis `npm start` côté frontend, et `uvicorn main:app --host 0.0.0.0 --port 8000` côté backend.

## Fonctionnement

1. **Import** : le fichier est envoyé à `POST /api/extract`. Les tableurs sont convertis en texte (pandas), les PDF et images sont envoyés directement au modèle (Gemini ou Claude), qui renvoie AC, DC, DL, CP, CA et résultat net de l'exercice le plus récent.
2. **Vérification** : l'utilisateur corrige les valeurs mal lues (ou saisit tout à la main).
3. **Calcul et comparaison** (dans le navigateur, `lib/ratios.ts`) :

| Ratio | Formule | Référence |
|---|---|---|
| Ratio de liquidité générale | AC / DC | norme usuelle (≥ 1,5 confortable, < 1 risque) |
| Ratio d'endettement | (DC + DL) / CP | norme usuelle (≤ 1 sain, > 2 élevé) |
| Rentabilité nette | Résultat net / CA | moyenne sectorielle Damodaran |
| Rentabilité financière (ROE) | Résultat net / CP | moyenne sectorielle Damodaran |

4. **Analyse rédigée** : `POST /api/analyse` produit une synthèse, les points forts, les points de vigilance, un plan d'action priorisé et une lecture bancaire.

## API du backend

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/extract` | Fichier du bilan → postes extraits (JSON) |
| POST | `/api/analyse` | Ratios et verdicts → analyse rédigée (JSON) |
| GET | `/api/benchmarks?region=emerg&refresh=false` | Référentiel Damodaran |
| POST | `/api/benchmarks/upload` | Import manuel des fichiers Damodaran |
| GET | `/api/health` | État du serveur |

Documentation interactive : http://localhost:8000/docs

## Référentiel : Damodaran, marchés émergents

Source : https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html (mise à jour chaque janvier).

Le backend télécharge automatiquement deux fichiers :

| Fichier | Donnée utilisée | Ratio comparé |
|---|---|---|
| `marginemerg.xls` | Net Margin | Rentabilité nette |
| `roeemerg.xls` | ROE (unadjusted) | ROE |

Le résultat est mis en cache 30 jours dans `data/cache/`. Si le téléchargement échoue, l'ancien cache est conservé. Sans accès Internet, la page **Référentiel** permet d'importer les fichiers à la main. Test en ligne de commande : `python damodaran.py`.

**À savoir :**
- Ce sont des **moyennes sectorielles** (pas de quartiles) calculées sur des **sociétés cotées** des marchés émergents. Une PME tunisienne n'est pas directement comparable : utilisez-les comme repère, pas comme verdict.
- Damodaran ne publie ni liquidité générale ni endettement (DC + DL) / CP : ces deux ratios sont jugés selon les normes usuelles.
- Verdict sectoriel : « au niveau ou au-dessus » si le ratio atteint la moyenne, « légèrement en dessous » jusqu'à 75 % de la moyenne, « nettement en dessous » au-delà.

## Limites et pistes

- **Banques** : un bilan bancaire est détecté et signalé, mais les ratios sont ceux des entreprises.
- **Sécurité** : avant une mise en production, ajoutez authentification et limitation de débit.
- **Évolutions** : référentiel tunisien (BVMT, BCT), historique des analyses, export PDF du rapport.
