import os, re, time, json, base64, hashlib, secrets, uuid
from collections import defaultdict
from cryptography.fernet import Fernet, InvalidToken
from fastapi import FastAPI, Depends, Header, HTTPException, Request, Path
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from supabase import create_client
from dotenv import load_dotenv
from .agents import orchestrator, adapt_roadmap, generate_quiz, CAREERS, ACHIEVEMENTS
load_dotenv()
app = FastAPI(title="SkillPath AI")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.add_middleware(GZipMiddleware, minimum_size=1024)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store"})
    return resp
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"]) if os.getenv("SUPABASE_URL") else None

def uid(authorization: str = Header(None)):
    if not sb: raise HTTPException(500, "Supabase is not configured on the server")
    if not authorization: raise HTTPException(401, "Missing token")
    try: return sb.auth.get_user(authorization.split()[-1]).user
    except Exception: raise HTTPException(401, "Invalid or expired session") from None

def is_demo(u): return bool((getattr(u, 'app_metadata', None) or {}).get('is_demo'))  # app_metadata is writable only with the service key

def load(u):
    p = (sb.table("profiles").select("*").eq("id", u.id).execute().data or [None])[0]
    if not p:
        p = {"id": u.id, "name": "Demo User" if is_demo(u) else (u.email or "Learner").split("@")[0], "xp": 0, "streak": 0, "career_goal": None, "is_demo": is_demo(u)}
        sb.table("profiles").insert(p).execute()
    sk = {r["skill"]: r["level"] for r in sb.table("skill_scores").select("*").eq("user_id", u.id).execute().data}
    rm = (sb.table("roadmaps").select("*").eq("user_id", u.id).execute().data or [None])[0]
    p["achievements"] = [r["key"] for r in sb.table("achievements").select("key").eq("user_id", u.id).execute().data]
    return p, sk, rm

def persist_profile(p): sb.table("profiles").update({k: p.get(k) for k in ("name", "career_goal", "xp", "streak", "last_active")}).eq("id", p["id"]).execute()
def grant(u_id, keys):
    for k in keys: sb.table("achievements").upsert({"user_id": u_id, "key": k}).execute()
def tv(t): return [{"agent": m["agent"], "to": m["to"]} for m in t]

@app.get("/api/health")
def health(): return {"ok": True, "gemini": bool(os.getenv("GEMINI_API_KEY")), "supabase": bool(sb), "demo": demo_enabled()}

# ---------------- Demo mode ----------------
# Each demo visitor gets their OWN real Supabase user (auto-confirmed, random password, app_metadata.is_demo=true).
# The browser receives a normal session, so every endpoint + RLS policy applies exactly as for real users.
def demo_enabled(): return os.getenv("DEMO_ENABLED", "true").lower() == "true" and bool(sb) and bool(os.getenv("SUPABASE_ANON_KEY"))
_hits = defaultdict(list)
def _throttle(ip, limit=int(os.getenv("DEMO_RATE_PER_HOUR", "10"))):
    now = time.time(); _hits[ip] = [t for t in _hits[ip] if now - t < 3600]
    if len(_hits[ip]) >= limit: raise HTTPException(429, "Too many demo sessions from this network. Try again later.")
    _hits[ip].append(now)

@app.post("/api/demo/login")
def demo_login(request: Request):
    if not demo_enabled(): raise HTTPException(403, "Demo mode is disabled")
    _throttle((request.headers.get("x-forwarded-for") or request.client.host or "?").split(",")[0].strip())
    email, pw = f"demo-{uuid.uuid4().hex[:12]}@demo.skillpath.app", secrets.token_urlsafe(24)
    try:
        sb.auth.admin.create_user({"email": email, "password": pw, "email_confirm": True,
                                   "app_metadata": {"is_demo": True}, "user_metadata": {"name": "Demo User"}})
        anon = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])  # separate client: never mutate the service client
        s = anon.auth.sign_in_with_password({"email": email, "password": pw}).session
    except Exception as e:
        print("demo login error:", type(e).__name__); raise HTTPException(502, "Could not start demo session") from None
    return {"access_token": s.access_token, "refresh_token": s.refresh_token}

@app.post("/api/demo/reset")
def demo_reset(u=Depends(uid)):
    if not is_demo(u): raise HTTPException(403, "Only demo accounts can be reset")
    for t in ("skill_scores", "roadmaps", "attempts", "achievements", "messages"): sb.table(t).delete().eq("user_id", u.id).execute()
    sb.table("profiles").update({"name": "Demo User", "career_goal": None, "xp": 0, "streak": 0, "last_active": None}).eq("id", u.id).execute()
    return {"ok": True}
@app.get("/api/careers")
def careers(): return CAREERS

@app.get("/api/me")
def me(u=Depends(uid)):
    p, sk, rm = load(u)
    att = sb.table("attempts").select("skill,score,created_at").eq("user_id", u.id).order("created_at", desc=True).limit(10).execute().data
    return {"profile": p, "skills": sk, "roadmap": rm, "attempts": att, "achievements": [{"key": k, "label": ACHIEVEMENTS.get(k, k)} for k in p["achievements"]]}

class Plan(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    goal: str = Field(max_length=60)
    ratings: dict[str, int] = Field(max_length=12)
    @field_validator("name")
    @classmethod
    def clean_name(cls, v):
        v = re.sub(r"[\x00-\x1f<>]", "", v).strip()
        if not v: raise ValueError("name is required")
        return v
    @field_validator("ratings")
    @classmethod
    def ratings_in_range(cls, v):
        if any(not 0 <= x <= 100 for x in v.values()): raise ValueError("ratings must be between 0 and 100")
        return v
@app.post("/api/analyze")
def analyze(b: Plan, u=Depends(uid)):
    if b.goal not in CAREERS: raise HTTPException(400, "Unknown career goal")
    if set(b.ratings) - set(CAREERS[b.goal]): raise HTTPException(422, "Ratings contain skills outside this career")
    p, _, _ = load(u); p.update(name=b.name, career_goal=b.goal)
    ratings = b.ratings
    r = orchestrator.plan(b.goal, ratings, p)
    for k, v in ratings.items(): sb.table("skill_scores").upsert({"user_id": u.id, "skill": k, "level": v}).execute()
    sb.table("roadmaps").upsert({"user_id": u.id, "summary": r["summary"], "steps": r["roadmap"], "matches": r["matches"]}).execute()
    persist_profile(r["profile"]); grant(u.id, r["new_achievements"])
    return {"summary": r["summary"], "matches": r["matches"], "ai": r["ai"], "trace": tv(r["trace"])}

# Quizzes are stateless: the questions *with answers* are encrypted into an opaque, user-bound, expiring token.
# The browser only sees questions without answers, and cannot forge or alter a score.
def _fernet():
    secret = os.getenv("QUIZ_SECRET") or os.getenv("SUPABASE_SERVICE_KEY") or ""
    if not secret: raise HTTPException(500, "Server secret not configured")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))
QUIZ_TTL = 3600

@app.get("/api/quiz/{skill}")
def quiz(skill: str = Path(min_length=1, max_length=60), u=Depends(uid)):
    _, sk, _ = load(u)
    if skill not in sk: raise HTTPException(404, "Unknown skill")
    qs = generate_quiz(skill, sk[skill])[:10]
    token = _fernet().encrypt(json.dumps({"u": u.id, "s": skill, "q": qs}).encode()).decode()
    return {"skill": skill, "token": token, "questions": [{"q": q["q"], "options": q["options"]} for q in qs]}

class Submit(BaseModel):
    token: str = Field(min_length=1, max_length=20000)
    answers: list[int] = Field(min_length=1, max_length=10)
    @field_validator("answers")
    @classmethod
    def valid_indexes(cls, v):
        if any(not 0 <= a <= 3 for a in v): raise ValueError("answer index must be 0-3")
        return v

@app.post("/api/quiz/submit")
def submit(b: Submit, u=Depends(uid)):
    try: data = json.loads(_fernet().decrypt(b.token.encode(), ttl=QUIZ_TTL))
    except InvalidToken: raise HTTPException(400, "Quiz expired or invalid. Please start a new quiz.") from None
    if data["u"] != u.id: raise HTTPException(403, "This quiz belongs to another user")
    if len(b.answers) != len(data["q"]): raise HTTPException(422, "Answer more questions to submit")
    skill = data["s"]; p, sk, rm = load(u)
    r = orchestrator.evaluate(skill, data["q"], b.answers, p)
    lvl = round(0.5 * sk.get(skill, 0) + 0.5 * r["score"])
    sb.table("skill_scores").upsert({"user_id": u.id, "skill": skill, "level": lvl}).execute()
    sb.table("attempts").insert({"user_id": u.id, "skill": skill, "score": r["score"], "feedback": r["feedback"]}).execute()
    if rm: sb.table("roadmaps").update({"steps": adapt_roadmap(rm["steps"], skill, r["score"])}).eq("user_id", u.id).execute()
    persist_profile(r["profile"]); grant(u.id, r["new_achievements"])
    return {"score": r["score"], "feedback": r["feedback"], "new_level": lvl, "xp": r["xp_delta"], "new_achievements": r["new_achievements"],
            "adapted": bool(rm) and r["score"] < 60, "trace": tv(r["trace"])}

@app.post("/api/roadmap/{step_id}/complete")
def complete(step_id: str = Path(min_length=1, max_length=32), u=Depends(uid)):
    p, sk, rm = load(u)
    st = next((s for s in (rm or {}).get("steps", []) if s["id"] == step_id), None)
    if not st: raise HTTPException(404, "Step not found")
    if st["done"]: return {"xp": 0, "new_achievements": []}
    st["done"] = True
    r = orchestrator.complete_step(st["xp"], p)
    sb.table("roadmaps").update({"steps": rm["steps"]}).eq("user_id", u.id).execute()
    sb.table("skill_scores").upsert({"user_id": u.id, "skill": st["skill"], "level": min(100, sk.get(st["skill"], 0) + 10)}).execute()
    persist_profile(r["profile"]); grant(u.id, r["new_achievements"])
    return {"xp": r["xp_delta"], "new_achievements": r["new_achievements"]}

class Chat(BaseModel): message: str = Field(min_length=1, max_length=1000)
@app.post("/api/mentor")
def mentor(b: Chat, u=Depends(uid)):
    p, sk, rm = load(u)
    hist = list(reversed(sb.table("messages").select("role,content").eq("user_id", u.id).order("id", desc=True).limit(8).execute().data))
    r = orchestrator.mentor(b.message, hist, p, (rm or {}).get("steps", []), sk)
    sb.table("messages").insert([{"user_id": u.id, "role": "user", "content": b.message}, {"user_id": u.id, "role": "assistant", "content": r["reply"]}]).execute()
    return {"reply": r["reply"], "action": r.get("action"), "ai": r["ai"], "trace": tv(r["trace"])}
@app.get("/api/mentor/history")
def history(u=Depends(uid)): return sb.table("messages").select("role,content").eq("user_id", u.id).order("id").limit(50).execute().data
