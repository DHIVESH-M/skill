"""Shared fixtures: an in-memory Supabase fake (tables + auth) so API tests run offline and never touch real data or Gemini."""
import os
from types import SimpleNamespace as N

os.environ["GEMINI_API_KEY"] = ""      # force deterministic agent fallbacks
os.environ["QUIZ_SECRET"] = "test-secret"
os.environ.pop("SUPABASE_URL", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402

PK = {"profiles": ["id"], "skill_scores": ["user_id", "skill"], "roadmaps": ["user_id"], "achievements": ["user_id", "key"]}


class Query:
    def __init__(self, db, name): self.db, self.name, self.op, self.f, self.payload, self.ord, self.lim = db, name, "select", [], None, None, None
    def select(self, *_a, **_k): return self
    def eq(self, k, v): self.f.append((k, v)); return self
    def order(self, col, desc=False): self.ord = (col, desc); return self
    def limit(self, n): self.lim = n; return self
    def insert(self, p): self.op, self.payload = "insert", p; return self
    def upsert(self, p): self.op, self.payload = "upsert", p; return self
    def update(self, p): self.op, self.payload = "update", p; return self
    def delete(self): self.op = "delete"; return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        hit = lambda r: all(r.get(k) == v for k, v in self.f)
        if self.op == "select":
            out = [dict(r) for r in rows if hit(r)]
            if self.ord: out.sort(key=lambda r: r.get(self.ord[0], 0), reverse=self.ord[1])
            return N(data=out[: self.lim] if self.lim else out)
        if self.op == "insert":
            for item in (self.payload if isinstance(self.payload, list) else [self.payload]):
                row = dict(item); row.setdefault("id", len(rows) + 1); row.setdefault("created_at", f"{len(rows):06d}"); rows.append(row)
        elif self.op == "upsert":
            keys = PK[self.name]; cur = next((r for r in rows if all(r.get(k) == self.payload.get(k) for k in keys)), None)
            cur.update(self.payload) if cur else rows.append(dict(self.payload))
        elif self.op == "update":
            [r.update(self.payload) for r in rows if hit(r)]
        elif self.op == "delete":
            rows[:] = [r for r in rows if not hit(r)]
        return N(data=[])


class FakeAuth:
    """Tokens: 'user-a', 'user-b' are normal users, 'demo-x' is a demo user, anything else is rejected."""
    def __init__(self): self.admin = N(create_user=self._create); self.created = []
    def _create(self, attrs): self.created.append(attrs)
    def get_user(self, token):
        if token not in ("user-a", "user-b", "demo-x"): raise ValueError("bad token")
        return N(user=N(id=token, email=f"{token}@t.dev", app_metadata={"is_demo": token.startswith("demo")}))


class FakeSB:
    def __init__(self): self.db = {}; self.auth = FakeAuth()
    def table(self, name): return Query(self.db, name)


@pytest.fixture
def fake(monkeypatch):
    sb = FakeSB(); monkeypatch.setattr(main, "sb", sb); main._hits.clear(); return sb


@pytest.fixture
def client(fake): return TestClient(main.app)


def auth(token="user-a"): return {"Authorization": f"Bearer {token}"}


RATINGS = {"Python": 40, "Statistics": 20, "SQL": 10, "Pandas": 30, "Machine Learning": 0, "Data Visualization": 50, "Git": 60}


@pytest.fixture
def onboard(client):
    def _go(token="user-a", name="Ana"):
        return client.post("/api/analyze", json={"name": name, "goal": "Data Scientist", "ratings": RATINGS}, headers=auth(token))
    return _go
