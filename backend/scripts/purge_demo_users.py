"""Delete demo users older than N hours (cascades to all their rows). Run via cron: python scripts/purge_demo_users.py 72"""
import os, sys, datetime as dt
from dotenv import load_dotenv; from supabase import create_client
load_dotenv(); sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
cut = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=int(sys.argv[1]) if len(sys.argv) > 1 else 72); n = 0
for u in sb.auth.admin.list_users(per_page=1000):
    if (u.app_metadata or {}).get("is_demo") and u.created_at < cut: sb.auth.admin.delete_user(u.id); n += 1
print(f"Deleted {n} demo users")
