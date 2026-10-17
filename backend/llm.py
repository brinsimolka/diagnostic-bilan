"""
Fournisseur d'IA, choisi dans .env avec LLM_PROVIDER :
  - "gemini"    (par défaut) : Google Gemini, niveau gratuit, clé sur https://aistudio.google.com/apikey
  - "anthropic" : Claude, payant, clé sur https://platform.claude.com

Le reste de l'application ne dépend pas du fournisseur : on lui passe une liste de
« parties » (texte ou fichier) et il renvoie un dict JSON.
"""
import base64
import json
import os
import re
import time
from dataclasses import dataclass

PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_FALLBACK_MODELS = os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.5-flash-lite")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")


@dataclass
class Part:
    text: str | None = None
    data: bytes | None = None
    mime: str | None = None  # ex. application/pdf, image/png


def model_name() -> str:
    return f"{PROVIDER}:{GEMINI_MODEL if PROVIDER == 'gemini' else CLAUDE_MODEL}"


def parse_json(text: str) -> dict:
    """Lit le JSON renvoyé par le modèle, même entouré de ``` ou d'une phrase."""
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Pas de JSON dans la réponse du modèle")
    return json.loads(text[start:end + 1])


# ---------- Gemini (gratuit) ----------
_gemini = None


def _ask_gemini(parts: list[Part], max_tokens: int) -> dict:
    global _gemini
    from google import genai
    from google.genai import types

    if _gemini is None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY manquante dans backend/.env")
        _gemini = genai.Client(api_key=key)

    contents = [types.Part.from_bytes(data=p.data, mime_type=p.mime) if p.data is not None else p.text for p in parts]
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        max_output_tokens=max_tokens,
        temperature=0.1,
    )

    # Modèle principal, puis modèles de secours si Google est surchargé (503) ou si le quota est atteint (429)
    models = [GEMINI_MODEL] + [m.strip() for m in GEMINI_FALLBACK_MODELS.split(",") if m.strip() and m.strip() != GEMINI_MODEL]
    last_error = None
    for model in models:
        for attempt in range(3):
            try:
                resp = _gemini.models.generate_content(model=model, contents=contents, config=config)
                return parse_json(resp.text)
            except Exception as e:
                code = getattr(e, "code", None)
                if code not in (429, 500, 503, 504):
                    raise
                last_error = e
                print(f"[gemini] {model} indisponible ({code}), essai {attempt + 1}/3")
                if code == 429:
                    break  # quota du modèle atteint : passer directement au modèle suivant
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(
        "Le service Gemini est surchargé ou la limite gratuite est atteinte. Réessayez dans quelques minutes."
    ) from last_error


# ---------- Claude (payant) ----------
_claude = None


def _ask_claude(parts: list[Part], max_tokens: int) -> dict:
    global _claude
    from anthropic import Anthropic

    if _claude is None:
        _claude = Anthropic()  # lit ANTHROPIC_API_KEY
    content = []
    for p in parts:
        if p.data is None:
            content.append({"type": "text", "text": p.text})
        elif p.mime == "application/pdf":
            content.append({"type": "document", "source": {"type": "base64", "media_type": p.mime, "data": base64.b64encode(p.data).decode()}})
        else:
            content.append({"type": "image", "source": {"type": "base64", "media_type": p.mime, "data": base64.b64encode(p.data).decode()}})
    msg = _claude.messages.create(model=CLAUDE_MODEL, max_tokens=max_tokens, messages=[{"role": "user", "content": content}])
    return parse_json("".join(b.text for b in msg.content if getattr(b, "type", "") == "text"))


def ask(parts: list[Part], max_tokens: int = 4000) -> dict:
    if PROVIDER == "anthropic":
        return _ask_claude(parts, max_tokens)
    if PROVIDER == "gemini":
        return _ask_gemini(parts, max_tokens)
    raise RuntimeError(f"LLM_PROVIDER inconnu : {PROVIDER} (choix : gemini, anthropic)")