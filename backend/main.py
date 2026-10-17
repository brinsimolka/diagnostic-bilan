"""
Diagnostic de bilan — backend FastAPI.

Endpoints :
  POST /api/extract   fichier (xlsx, xls, csv, txt, pdf, image) -> postes du bilan en JSON
  POST /api/analyse   ratios + référentiel -> synthèse, points forts, recommandations
  GET  /api/benchmarks  référentiel sectoriel Damodaran (marchés émergents par défaut)
  POST /api/benchmarks/upload  import manuel des fichiers Damodaran (si pas de réseau)
L'IA (Gemini gratuit ou Claude) est configurée dans llm.py via .env.
Le frontend (Next.js) est dans ../frontend.
"""
import io
import json
import os
import re
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from typing import List

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import damodaran

load_dotenv()

import llm  # noqa: E402  (après load_dotenv pour lire la configuration)
from llm import Part  # noqa: E402

MAX_FILE_MB = 20
MAX_TEXT_CHARS = 180_000

app = FastAPI(title="Diagnostic de bilan")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

EXTRACT_PROMPT = """Tu es un expert-comptable tunisien (Système Comptable des Entreprises). On te fournit le contenu d'un bilan et/ou d'un état de résultat.
Extrais les montants de l'exercice LE PLUS RÉCENT (pas l'exercice précédent).
Correspondances :
- actif_courant = "Total des actifs courants" (stocks + clients + autres actifs courants + placements + liquidités) = AC.
- passif_courant = "Total des passifs courants" (fournisseurs, autres passifs courants, concours bancaires, échéances à moins d'un an) = DC.
- passif_non_courant = "Total des passifs non courants" (emprunts à long et moyen terme, provisions LT) = DL.
- capitaux_propres = "Total des capitaux propres" APRÈS résultat de l'exercice.
- chiffre_affaires = revenus / ventes / chiffre d'affaires de l'exercice.
- resultat_net = résultat net de l'exercice (négatif si perte).
- total_bilan = total actif.
Si un total n'apparaît pas mais ses composantes oui, additionne-les. Mets null si introuvable. Valeurs numériques brutes (sans séparateurs), dans l'unité du document.
Détermine le type d'entité : "entreprise" ou "banque" (une banque a des postes comme créances sur la clientèle, dépôts de la clientèle).
Réponds UNIQUEMENT avec ce JSON, sans texte autour :
{"type_entite":"entreprise","raison_sociale":null,"exercice":"2024","devise":"TND","unite":"dinars","valeurs":{"actif_courant":0,"passif_courant":0,"passif_non_courant":0,"capitaux_propres":0,"chiffre_affaires":0,"resultat_net":0,"total_bilan":0},"verification":"une phrase : le total actif est-il égal au total passif ?","remarques":"ce qui est incertain"}"""

ANALYSE_PROMPT = """Tu es analyste financier senior dans une banque tunisienne. Rédige en français un diagnostic financier d'entreprise à partir des données ci-dessous. Chaque ratio est comparé soit à une norme usuelle d'analyse financière, soit à la moyenne sectorielle des sociétés cotées des marchés émergents (Damodaran, NYU Stern). Les rentabilités et l'autonomie sont en décimal (0,05 = 5 %).
Règles : appuie-toi uniquement sur ces chiffres, cite-les, ne change pas les verdicts, relie les ratios entre eux, rappelle si utile qu'une PME tunisienne n'est pas directement comparable à des sociétés cotées, reste concret.
Données : {data}
Réponds UNIQUEMENT avec ce JSON, sans texte autour :
{{"synthese":"3 à 4 phrases","note_globale":"Solide | Correcte | Fragile | Critique","points_forts":["..."],"points_vigilance":["..."],"recommandations":[{{"action":"...","priorite":"haute|moyenne|basse","impact_attendu":"..."}}],"avis_credit":"1 à 2 phrases : comment un banquier percevrait ce dossier"}}"""

IMAGE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif",
}


MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf",
}


def file_to_parts(name: str, data: bytes) -> list:
    """Transforme le fichier en parties (texte ou fichier) pour le modèle."""
    ext = Path(name).suffix.lower()

    if ext in MIME:  # PDF et images : lus directement par le modèle
        return [Part(data=data, mime=MIME[ext]), Part(text=EXTRACT_PROMPT)]

    if ext in (".xlsx", ".xlsm", ".xls", ".ods"):
        sheets = pd.read_excel(io.BytesIO(data), sheet_name=None, header=None)
        text = ""
        for sheet, df in sheets.items():
            df = df.dropna(how="all").dropna(axis=1, how="all")
            text += f"\n### Feuille : {sheet}\n" + df.to_csv(sep=";", index=False, header=False)
    else:  # csv, txt et autres formats texte
        text = data.decode("utf-8", errors="ignore")

    return [Part(text=EXTRACT_PROMPT + "\n\nCONTENU DU DOCUMENT :\n" + text[:MAX_TEXT_CHARS])]


@app.post("/api/extract")
async def extract(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(413, f"Fichier trop volumineux (max {MAX_FILE_MB} Mo)")
    try:
        parts = file_to_parts(file.filename or "fichier", data)
    except Exception as e:
        raise HTTPException(400, f"Fichier illisible : {e}")
    try:
        result = llm.ask(parts)
    except Exception as e:
        raise HTTPException(502, f"Échec de l'extraction : {e}")
    if "valeurs" not in result:
        raise HTTPException(502, "Réponse d'extraction incomplète")
    return result


class Analyse(BaseModel):
    secteur: str | None = None
    source_benchmark: str | None = None
    valeurs: dict
    ratios: list


@app.get("/api/benchmarks")
def benchmarks(region: str = "emerg", refresh: bool = False):
    """Référentiel Damodaran : marge nette et ROE par secteur."""
    try:
        return damodaran.get_benchmarks(region, refresh)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(502, f"Téléchargement des données Damodaran impossible : {e}")


@app.post("/api/analyse")
async def analyse(payload: Analyse):
    data = json.dumps(payload.model_dump(), ensure_ascii=False)
    try:
        return llm.ask([Part(text=ANALYSE_PROMPT.format(data=data))], max_tokens=4000)
    except Exception as e:
        raise HTTPException(502, f"Échec de l'analyse : {e}")


@app.post("/api/benchmarks/upload")
async def benchmarks_upload(files: List[UploadFile] = File(...)):
    """Import manuel de marginemerg.xls et roeemerg.xls."""
    contents = [await f.read() for f in files]
    try:
        data = damodaran.build(contents, "emerg")
    except Exception as e:
        raise HTTPException(400, f"Fichiers illisibles : {e}")
    if not data["industries"]:
        raise HTTPException(400, "Aucun fichier Damodaran reconnu")
    data["source"] += " (import manuel)"
    damodaran.save(data)
    return data


@app.get("/api/health")
def health():
    return {"status": "ok", "model": llm.model_name()}
