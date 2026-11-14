import datetime as dt

import app.agents as agents
from app.agents import adapt_roadmap, assessment_evaluator, career_matcher, generate_quiz, learning_recommender, orchestrator, progress_tracker, skill_analyzer

R = {"Python": 40, "SQL": 20, "Statistics": 80, "Pandas": 0, "Machine Learning": 10, "Data Visualization": 50, "Git": 60}


def test_skill_analyzer_orders_gaps_and_clamps_at_zero():
    out = skill_analyzer({"goal": "Data Scientist", "ratings": {**R, "Git": 100}})
    gaps = out["gaps"]; assert gaps[0]["skill"] == "Pandas" and gaps[0]["gap"] == 80
    assert next(g for g in gaps if g["skill"] == "Git")["gap"] == 0 and out["trace"][0]["to"] == "CareerMatcher"


def test_skill_analyzer_unknown_goal_is_safe():
    assert skill_analyzer({"goal": "Nope", "ratings": {}})["gaps"] == []


def test_career_matcher_ranks_best_fit_first():
    m = career_matcher({"ratings": {k: 80 for k in agents.CAREERS["UX Designer"]}})["matches"]
    assert m[0] == {"career": "UX Designer", "match": 100} and len(m) == 4 and m == sorted(m, key=lambda x: -x["match"])


def test_recommender_skips_closed_gaps_and_scales_xp():
    gaps = skill_analyzer({"goal": "Data Scientist", "ratings": {**R, "Python": 75}})["gaps"]
    steps = learning_recommender({"goal": "Data Scientist", "gaps": gaps})["roadmap"]
    skills = [s["skill"] for s in steps]; assert "Statistics" not in skills and "Pandas" in skills and len(set(s["id"] for s in steps)) == len(steps)
    assert next(s for s in steps if s["skill"] == "Pandas")["xp"] == 60


def test_recommender_merges_ai_output(monkeypatch):
    monkeypatch.setattr(agents, "ask_json", lambda p, fb: ({"steps": [{"skill": "Pandas", "title": "AI Pandas", "description": "d", "course": "c", "project": "p"}]}, True))
    out = learning_recommender({"goal": "Data Scientist", "gaps": [{"skill": "Pandas", "level": 0, "target": 80, "gap": 80}]})
    assert out["roadmap"][0]["title"] == "AI Pandas" and out["roadmap"][0]["done"] is False


def test_evaluator_scores_correctly():
    qs = [{"q": "a", "options": list("abcd"), "answer": 0}, {"q": "b", "options": list("abcd"), "answer": 1}]
    assert assessment_evaluator({"skill": "X", "quiz": qs, "answers": [0, 1]})["score"] == 100
    assert assessment_evaluator({"skill": "X", "quiz": qs, "answers": [0, 3]})["score"] == 50
    assert assessment_evaluator({"skill": "X", "quiz": qs, "answers": [3, 3]})["score"] == 0


def test_generate_quiz_falls_back_when_ai_returns_garbage(monkeypatch):
    monkeypatch.setattr(agents, "ask_json", lambda p, fb: ({"questions": "nonsense"}, True))
    assert generate_quiz("Python", 10) == agents.BANK


def test_tracker_streak_logic_and_badges():
    today, yday = dt.date.today(), dt.date.today() - dt.timedelta(days=1)
    t = lambda **p: progress_tracker({"profile": {"xp": 0, "streak": 0, **p}, "event": "step", "xp_delta": 30})
    assert t()["profile"]["streak"] == 1
    assert t(streak=2, last_active=yday.isoformat())["profile"]["streak"] == 3 and "streak_3" in t(streak=2, last_active=yday.isoformat())["new_achievements"]
    assert t(streak=5, last_active=today.isoformat())["profile"]["streak"] == 5          # same day: unchanged
    assert t(streak=5, last_active=(today - dt.timedelta(days=3)).isoformat())["profile"]["streak"] == 1  # broken
    assert "xp_100" in t(xp=80)["new_achievements"] and "xp_100" not in t(xp=80, achievements=["xp_100"])["new_achievements"]


def test_adapt_roadmap_rules():
    base = [{"id": "1", "skill": "SQL", "title": "Master SQL", "description": "d", "done": False, "xp": 20}]
    low = adapt_roadmap(base, "SQL", 40); assert low[0]["title"] == "Review SQL basics" and len(low) == 2
    assert len(adapt_roadmap(low, "SQL", 40)) == 2                           # no duplicate review quests
    assert "aced" in adapt_roadmap(base, "SQL", 90)[0]["description"] and base[0]["description"] == "d"   # input not mutated
    assert adapt_roadmap(base, "SQL", 70) == base


def test_orchestrator_runs_full_pipeline():
    r = orchestrator.plan("AI Engineer", {"Python": 50}, {"id": "u", "xp": 0, "streak": 0})
    assert r["roadmap"] and r["matches"] and r["new_achievements"] == ["first_steps"] and r["profile"]["xp"] == 25
