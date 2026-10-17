"""
Référentiel sectoriel : données d'Aswath Damodaran (NYU Stern).

Télécharge les fichiers Excel publiés sur
https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datacurrent.html
et en extrait, par secteur :
  - net_margin            (Net Margin, fichier margin*)
  - roe                   (ROE unadjusted, fichier roe*)

Les données sont mises à jour par Damodaran chaque année en janvier.
Le résultat est mis en cache sur disque (data/cache) pour CACHE_DAYS jours.
"""
import io
import json
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

BASE_URL = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/"

# Suffixe de fichier par région, tel qu'utilisé sur le site de Damodaran
REGIONS = {
    "emerg": ("emerg", "All Emerging Markets"),
    "global": ("Global", "Global"),
    "europe": ("Europe", "Europe"),
    "us": ("", "United States"),
}

FILES = {"margin": "margin", "roe": "roe"}

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
CACHE_DAYS = 30


def file_urls(region: str) -> dict:
    suffix, _ = REGIONS[region]
    return {k: f"{BASE_URL}{name}{suffix}.xls" for k, name in FILES.items()}


def _norm(x) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return re.sub(r"\s+", " ", str(x)).strip()


def _num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return None if (isinstance(x, float) and math.isnan(x)) else float(x)
    s = str(x).strip()
    if not s or re.fullmatch(r"n/?a", s, re.I):
        return None
    pct = "%" in s
    try:
        v = float(re.sub(r"[%,\s]", "", s))
    except ValueError:
        return None
    return v / 100 if pct else v


def parse_sheet(df: pd.DataFrame) -> dict:
    """Trouve la ligne 'Industry Name' et lit les colonnes utiles."""
    rows = df.values.tolist()
    h = next((i for i, r in enumerate(rows[:40]) if any(re.search(r"industry\s*name", _norm(c), re.I) for c in r)), None)
    if h is None:
        return {}
    prev = rows[h - 1] if h > 0 else [None] * len(rows[h])
    head = [f"{_norm(c)} {_norm(prev[j]) if j < len(prev) else ''}" for j, c in enumerate(rows[h])]
    name_col = next(j for j, c in enumerate(rows[h]) if re.search(r"industry\s*name", _norm(c), re.I))

    def find(pattern, prefer=None):
        idx = -1
        for j, t in enumerate(head):
            if re.search(pattern, t, re.I):
                if idx < 0 or (prefer and re.search(prefer, t, re.I) and not re.search(prefer, head[idx], re.I)):
                    idx = j
        return idx

    cols = {
        "firms": find(r"number\s*of\s*firms"),
        "net_margin": find(r"net\s*margin"),
        "roe": find(r"\broe\b", r"unadjusted"),
    }
    kinds = [k for k, j in cols.items() if k != "firms" and j >= 0]
    out = {}
    for r in rows[h + 1:]:
        name = _norm(r[name_col]) if name_col < len(r) else ""
        if not name:
            continue
        rec = {"firms": _num(r[cols["firms"]]) if cols["firms"] >= 0 else None}
        for k in kinds:
            rec[k] = _num(r[cols[k]]) if cols[k] < len(r) else None
        out[name] = rec
    return out


def parse_workbook(content: bytes) -> dict:
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None)
    for df in sheets.values():
        data = parse_sheet(df)
        if len(data) > 5:
            return data
    return {}


def build(contents: list, region: str = "emerg", files=None) -> dict:
    """Fusionne plusieurs fichiers Damodaran (bytes) en un référentiel unique."""
    merged: dict = {}
    for content in contents:
        for name, rec in parse_workbook(content).items():
            target = merged.setdefault(name, {"name": name, "firms": None, "net_margin": None, "roe": None})
            for k, v in rec.items():
                if v is not None:
                    target[k] = v
    industries = sorted(merged.values(), key=lambda x: x["name"])
    return {
        "source": f"Damodaran Online (NYU Stern), {REGIONS.get(region, (None, region))[1]}",
        "region": region,
        "files": files or {},
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "industries": industries,
    }


def fetch(region: str = "emerg") -> dict:
    if region not in REGIONS:
        raise ValueError(f"Région inconnue : {region}. Choix : {', '.join(REGIONS)}")
    urls = file_urls(region)
    headers = {"User-Agent": "Mozilla/5.0 (diagnostic-bilan)"}
    contents = []
    for url in urls.values():
        resp = requests.get(url, headers=headers, timeout=60)
        resp.raise_for_status()
        contents.append(resp.content)
    return build(contents, region, urls)


def save(data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"damodaran_{data['region']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def get_benchmarks(region: str = "emerg", refresh: bool = False) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"damodaran_{region}.json"
    if not refresh and cache.exists() and time.time() - cache.stat().st_mtime < CACHE_DAYS * 86400:
        return json.loads(cache.read_text(encoding="utf-8"))
    try:
        data = fetch(region)
    except Exception:
        # Pas de réseau : on garde l'ancien cache (même expiré) s'il existe
        if cache.exists():
            return json.loads(cache.read_text(encoding="utf-8"))
        raise
    save(data)
    return data


if __name__ == "__main__":
    # python damodaran.py  -> télécharge et affiche un aperçu
    d = get_benchmarks("emerg", refresh=True)
    print(d["source"], "-", len(d["industries"]), "secteurs")
    for x in d["industries"][:10]:
        print(x)
