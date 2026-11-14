import os, json, re
from dotenv import load_dotenv
load_dotenv()

_client = None

def _get():
    global _client
    if _client is None and os.getenv("GEMINI_API_KEY"):
        from google import genai
        from google.genai import types
        # Keep serverless requests responsive; ask_json falls back if Gemini is slow.
        _client = genai.Client(
            api_key=os.environ["GEMINI_API_KEY"],
            http_options=types.HttpOptions(timeout=8000),
        )
    return _client

def ask_json(prompt: str, fallback):
    """Ask Gemini for JSON. Returns deterministic fallback on any API failure."""
    c = _get()
    if not c:
        return fallback, False
    try:
        r = c.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        return json.loads(re.sub(r"^```json|```$", "", r.text.strip())), True
    except Exception as e:
        print("Gemini error:", type(e).__name__)
        return fallback, False
