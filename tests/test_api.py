import json

import pytest

import app.agents as agents
from tests.conftest import RATINGS, auth
import app.main as main


def decrypt_quiz(token):
    return json.loads(main._fernet().decrypt(token.encode()))


# ---------- authentication & authorization ----------
@pytest.mark.parametrize("method,path", [("get", "/api/me"), ("post", "/api/analyze"), ("get", "/api/quiz/Python"), ("post", "/api/quiz/submit"),
                                         ("post", "/api/roadmap/abc/complete"), ("post", "/api/mentor"), ("get", "/api/mentor/history"), ("post", "/api/demo/reset")])
def test_protected_routes_reject_missing_token(client, method, path):
    kwargs = {"json": {}} if method == "post" else {}
    assert client.request(method.upper(), path, **kwargs).status_code == 401
    assert client.request(method.upper(), path, headers=auth("forged"), **kwargs).status_code == 401


def test_invalid_token_is_rejected(client):
    assert client.get("/api/me", headers=auth("forged")).status_code == 401


def test_health_and_public_careers(client):
    assert client.get("/api/health").json()["ok"] is True
    assert "Data Scientist" in client.get("/api/careers").json()


def test_security_headers_and_cors_whitelist(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store" and r.headers["x-frame-options"] == "DENY"
    pre = client.options("/api/me", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in pre.headers


# ---------- onboarding / analysis ----------
def test_new_user_gets_profile_and_no_roadmap(client):
    me = client.get("/api/me", headers=auth()).json()
    assert me["roadmap"] is None and me["profile"]["xp"] == 0


def test_analyze_persists_roadmap_skills_profile_and_badge(client, onboard):
    r = onboard(); assert r.status_code == 200
    body = r.json(); assert [t["agent"] for t in body["trace"]] == ["SkillAnalyzer", "CareerMatcher", "LearningRecommender", "ProgressTracker"]
    me = client.get("/api/me", headers=auth()).json()
    assert me["profile"]["career_goal"] == "Data Scientist" and me["profile"]["xp"] == 25 and me["profile"]["name"] == "Ana"
    assert me["skills"] == RATINGS
    steps = me["roadmap"]["steps"]; assert steps and steps[0]["skill"] == "Machine Learning"  # biggest gap first
    assert all(not s["done"] for s in steps) and me["roadmap"]["matches"]
    assert [a["key"] for a in me["achievements"]] == ["first_steps"]


@pytest.mark.parametrize("payload,code", [
    ({"name": "A", "goal": "Wizard", "ratings": {}}, 400),
    ({"name": "", "goal": "Data Scientist", "ratings": {"Python": 10}}, 422),
    ({"name": "  <>  ", "goal": "Data Scientist", "ratings": {"Python": 10}}, 422),
    ({"name": "A", "goal": "Data Scientist", "ratings": {"Python": 101}}, 422),
    ({"name": "A", "goal": "Data Scientist", "ratings": {"Python": -1}}, 422),
    ({"name": "A", "goal": "Data Scientist", "ratings": {"Cooking": 50}}, 422),
    ({"name": "x" * 61, "goal": "Data Scientist", "ratings": {"Python": 1}}, 422),
    ({"goal": "Data Scientist"}, 422),
])
def test_analyze_validation(client, payload, code):
    assert client.post("/api/analyze", json=payload, headers=auth()).status_code == code


def test_analyze_sanitizes_name(client):
    client.post("/api/analyze", json={"name": " <b>Ana</b> ", "goal": "Data Scientist", "ratings": {"Python": 10}}, headers=auth())
    assert client.get("/api/me", headers=auth()).json()["profile"]["name"] == "bAna/b"


# ---------- quizzes & assessments ----------
def test_quiz_hides_answers_and_rejects_unknown_skill(client, onboard):
    onboard()
    q = client.get("/api/quiz/Python", headers=auth()).json()
    assert q["skill"] == "Python" and q["questions"] and all("answer" not in x for x in q["questions"]) and "answer" not in json.dumps(q["questions"])
    assert client.get("/api/quiz/Cooking", headers=auth()).status_code == 404


def test_perfect_quiz_updates_level_attempt_xp_and_badge(client, onboard):
    onboard(); q = client.get("/api/quiz/Python", headers=auth()).json()
    answers = [x["answer"] for x in decrypt_quiz(q["token"])["q"]]
    r = client.post("/api/quiz/submit", json={"token": q["token"], "answers": answers}, headers=auth()).json()
    assert r["score"] == 100 and r["new_level"] == 70 and r["adapted"] is False and "quiz_whiz" in r["new_achievements"]
    me = client.get("/api/me", headers=auth()).json()
    assert me["skills"]["Python"] == 70 and me["attempts"][0]["score"] == 100 and me["profile"]["xp"] == 25 + r["xp"]


def test_failed_quiz_adds_adaptive_review_step(client, onboard):
    onboard(); q = client.get("/api/quiz/Python", headers=auth()).json()
    wrong = [(x["answer"] + 1) % 4 for x in decrypt_quiz(q["token"])["q"]]
    r = client.post("/api/quiz/submit", json={"token": q["token"], "answers": wrong}, headers=auth()).json()
    assert r["score"] == 0 and r["adapted"] is True
    steps = client.get("/api/me", headers=auth()).json()["roadmap"]["steps"]
    assert steps[0]["title"] == "Review Python basics"


def test_quiz_token_cannot_be_forged_replayed_across_users_or_resized(client, onboard):
    onboard(); onboard("user-b", "Bo")
    q = client.get("/api/quiz/Python", headers=auth()).json(); n = len(q["questions"])
    assert client.post("/api/quiz/submit", json={"token": "garbage", "answers": [0] * n}, headers=auth()).status_code == 400
    assert client.post("/api/quiz/submit", json={"token": q["token"], "answers": [0] * n}, headers=auth("user-b")).status_code == 403
    assert client.post("/api/quiz/submit", json={"token": q["token"], "answers": [0]}, headers=auth()).status_code == 422
    assert client.post("/api/quiz/submit", json={"token": q["token"], "answers": [9] * n}, headers=auth()).status_code == 422


def test_expired_quiz_is_rejected(client, onboard, monkeypatch):
    onboard(); q = client.get("/api/quiz/Python", headers=auth()).json(); monkeypatch.setattr(main, "QUIZ_TTL", -1)
    assert client.post("/api/quiz/submit", json={"token": q["token"], "answers": [0] * len(q["questions"])}, headers=auth()).status_code == 400


def test_ai_generated_quiz_is_used_and_malformed_questions_dropped(client, onboard, monkeypatch):
    good = {"q": "2+2?", "options": ["3", "4", "5", "6"], "answer": 1}
    monkeypatch.setattr(agents, "ask_json", lambda prompt, fb: ({"questions": [good, {"q": "bad", "options": ["x"], "answer": 0}]}, True))
    onboard(); q = client.get("/api/quiz/Python", headers=auth()).json()
    assert [x["q"] for x in q["questions"]] == ["2+2?"]


# ---------- roadmap progress ----------
def test_complete_step_awards_xp_once_and_levels_skill(client, onboard):
    onboard(); step = client.get("/api/me", headers=auth()).json()["roadmap"]["steps"][0]
    r = client.post(f"/api/roadmap/{step['id']}/complete", json={}, headers=auth()).json()
    assert r["xp"] == step["xp"] and "first_quest" in r["new_achievements"]
    assert client.post(f"/api/roadmap/{step['id']}/complete", json={}, headers=auth()).json()["xp"] == 0   # idempotent
    me = client.get("/api/me", headers=auth()).json()
    assert me["profile"]["xp"] == 25 + step["xp"] and me["skills"][step["skill"]] == RATINGS[step["skill"]] + 10
    assert me["roadmap"]["steps"][0]["done"] is True
    assert client.post("/api/roadmap/nope/complete", json={}, headers=auth()).status_code == 404


# ---------- AI mentor ----------
def test_mentor_replies_persists_history_and_validates(client, onboard):
    onboard(); r = client.post("/api/mentor", json={"message": "What next?"}, headers=auth()).json()
    assert "Machine Learning" in r["reply"] and r["action"] == {"type": "quiz", "skill": "Machine Learning"} and "AIMentor" in [t["agent"] for t in r["trace"]]
    hist = client.get("/api/mentor/history", headers=auth()).json()
    assert [m["role"] for m in hist] == ["user", "assistant"]
    assert client.post("/api/mentor", json={"message": ""}, headers=auth()).status_code == 422
    assert client.post("/api/mentor", json={"message": "x" * 1001}, headers=auth()).status_code == 422


def test_mentor_uses_ai_response_when_available(client, onboard, monkeypatch):
    onboard(); monkeypatch.setattr(agents, "ask_json", lambda p, fb: ({"reply": "Try SQL joins!", "action": {"type": "roadmap"}}, True))
    r = client.post("/api/mentor", json={"message": "help"}, headers=auth()).json()
    assert r["reply"] == "Try SQL joins!" and r["action"] == {"type": "roadmap"} and r["ai"] is True


# ---------- data isolation ----------
def test_users_cannot_see_or_modify_each_others_data(client, onboard):
    onboard("user-a"); step = client.get("/api/me", headers=auth("user-a")).json()["roadmap"]["steps"][0]
    client.post("/api/mentor", json={"message": "secret"}, headers=auth("user-a"))
    b = client.get("/api/me", headers=auth("user-b")).json()
    assert b["roadmap"] is None and b["skills"] == {} and b["profile"]["career_goal"] is None
    assert client.post(f"/api/roadmap/{step['id']}/complete", json={}, headers=auth("user-b")).status_code == 404
    assert client.get("/api/mentor/history", headers=auth("user-b")).json() == []
    assert client.get("/api/quiz/Python", headers=auth("user-b")).status_code == 404


# ---------- demo mode ----------
def test_demo_login_creates_flagged_user_and_returns_session(client, fake, monkeypatch):
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon"); monkeypatch.setenv("SUPABASE_URL", "http://x")
    from types import SimpleNamespace as N
    monkeypatch.setattr(main, "create_client", lambda u, k: N(auth=N(sign_in_with_password=lambda c: N(session=N(access_token="AT", refresh_token="RT")))))
    r = client.post("/api/demo/login"); assert r.status_code == 200 and r.json() == {"access_token": "AT", "refresh_token": "RT"}
    c = fake.auth.created[0]; assert c["app_metadata"] == {"is_demo": True} and c["email_confirm"] is True and c["email"].endswith("@demo.skillpath.app")


def test_demo_disabled_and_rate_limited(client, monkeypatch):
    monkeypatch.setenv("DEMO_ENABLED", "false"); assert client.post("/api/demo/login").status_code == 403
    monkeypatch.setenv("DEMO_ENABLED", "true"); monkeypatch.setenv("SUPABASE_ANON_KEY", "a"); monkeypatch.setenv("SUPABASE_URL", "http://x")
    from types import SimpleNamespace as N
    monkeypatch.setattr(main, "create_client", lambda u, k: N(auth=N(sign_in_with_password=lambda c: N(session=N(access_token="a", refresh_token="b")))))
    codes = [client.post("/api/demo/login").status_code for _ in range(12)]
    assert codes[:10] == [200] * 10 and codes[10:] == [429, 429]


def test_demo_user_is_labelled_and_can_reset_only_itself(client, onboard):
    me = client.get("/api/me", headers=auth("demo-x")).json()
    assert me["profile"]["is_demo"] is True and me["profile"]["name"] == "Demo User"
    onboard("demo-x", "Demo User"); onboard("user-a")
    assert client.post("/api/demo/reset", headers=auth("user-a")).status_code == 403       # real users can't use it
    assert client.post("/api/demo/reset", headers=auth("demo-x")).status_code == 200
    assert client.get("/api/me", headers=auth("demo-x")).json()["roadmap"] is None
    assert client.get("/api/me", headers=auth("user-a")).json()["roadmap"] is not None      # others untouched
