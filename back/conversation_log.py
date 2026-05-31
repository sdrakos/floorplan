#!/usr/bin/env python3
"""
conversation_log.py — local SQLite mirror of the Notion "📝 Claude Conversations" DB.

One row per conversation (keyed by --session). Each checkpoint UPDATES that row
(summary/decisions/action items grow) instead of inserting duplicates. The Notion
row is mirrored separately by Claude via the Notion MCP; store its URL back here
with --notion-url so future checkpoints update the same Notion page.

Usage:
  python conversation_log.py init
  python conversation_log.py upsert --session <id> --title "..." --summary "..." \
      --status "In Progress" --project "Construction" --type "Development" \
      --device "🖥️ Desktop Σπίτι" --action-items "..." --key-decisions "..." \
      [--notion-url "https://www.notion.so/..."]
  python conversation_log.py get --session <id>
  python conversation_log.py list [--limit 20]

Schema mirrors the Notion data source cd521f39-b784-426d-8a73-2a7f35391d65.
"""
import argparse
import io
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

# Windows-safe UTF-8 stdout (Greek + emoji)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude.db")

STATUS = ["Completed", "In Progress", "Follow Up Needed", "Reference"]
TYPES = ["Development", "Strategy", "Debug", "Legal/Contracts", "Research", "Design", "DevOps", "Other"]
PROJECTS = ["timologia.me", "BeBroker", "RoomZ", "MedPlatform", "AgelClaw",
            "Construction", "AGEL AI IKE", "Trading/Crypto", "General", "CasRecruitment"]
DEVICES = ["🖥️ Desktop Σπίτι", "💻 Laptop", "📱 Mobile", "🏢 Γραφείο", "🌐 Claude.ai Web", "Other"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    chat_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    session        TEXT UNIQUE NOT NULL,   -- stable key per conversation
    title          TEXT,
    summary        TEXT,
    action_items   TEXT,
    key_decisions  TEXT,
    status         TEXT,                   -- one of STATUS
    project        TEXT,                   -- JSON array of PROJECTS
    type           TEXT,                   -- one of TYPES
    device_source  TEXT,                   -- one of DEVICES
    date_start     TEXT,                   -- ISO-8601
    date_end       TEXT,
    notion_url     TEXT,                   -- mirrored Notion page URL
    created_time   TEXT NOT NULL,          -- ISO-8601 UTC
    updated_time   TEXT NOT NULL           -- ISO-8601 UTC
);
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(SCHEMA)
    return conn


def cmd_init(_args):
    connect().close()
    print(f"✓ initialized {DB_PATH}")


def _norm_project(value):
    """Accept comma-separated or repeated --project; store as JSON array."""
    if not value:
        return None
    if isinstance(value, str):
        items = [p.strip() for p in value.split(",") if p.strip()]
    else:
        items = [p.strip() for p in value if p.strip()]
    return json.dumps(items, ensure_ascii=False)


def cmd_upsert(args):
    conn = connect()
    ts = now_iso()
    row = conn.execute("SELECT * FROM conversations WHERE session = ?", (args.session,)).fetchone()
    project = _norm_project(args.project)
    if row is None:
        conn.execute(
            """INSERT INTO conversations
               (session, title, summary, action_items, key_decisions, status, project,
                type, device_source, date_start, notion_url, created_time, updated_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (args.session, args.title, args.summary, args.action_items, args.key_decisions,
             args.status, project, args.type, args.device, args.date or ts, args.notion_url, ts, ts),
        )
        action = "created"
    else:
        # Only overwrite fields that were provided (keep prior values otherwise).
        fields = {
            "title": args.title, "summary": args.summary, "action_items": args.action_items,
            "key_decisions": args.key_decisions, "status": args.status, "project": project,
            "type": args.type, "device_source": args.device, "notion_url": args.notion_url,
        }
        sets, vals = [], []
        for col, val in fields.items():
            if val is not None:
                sets.append(f"{col} = ?")
                vals.append(val)
        sets.append("updated_time = ?")
        vals.append(ts)
        vals.append(args.session)
        conn.execute(f"UPDATE conversations SET {', '.join(sets)} WHERE session = ?", vals)
        action = "updated"
    conn.commit()
    out = conn.execute("SELECT chat_id, session FROM conversations WHERE session = ?",
                       (args.session,)).fetchone()
    conn.close()
    print(f"✓ {action} chat_id={out['chat_id']} session={out['session']}")


def cmd_get(args):
    conn = connect()
    row = conn.execute("SELECT * FROM conversations WHERE session = ?", (args.session,)).fetchone()
    conn.close()
    if not row:
        print("(not found)")
        return
    print(json.dumps({k: row[k] for k in row.keys()}, ensure_ascii=False, indent=2))


def cmd_list(args):
    conn = connect()
    rows = conn.execute(
        "SELECT chat_id, date_start, status, type, project, title FROM conversations "
        "ORDER BY chat_id DESC LIMIT ?", (args.limit,)).fetchall()
    conn.close()
    for r in rows:
        print(f"#{r['chat_id']:>3} [{(r['status'] or '-'):<16}] {r['date_start'][:10]}  "
              f"{r['type'] or '-':<12} {r['title'] or ''}")
    if not rows:
        print("(empty)")


def main():
    p = argparse.ArgumentParser(description="Local SQLite mirror of Notion Claude Conversations")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init").set_defaults(func=cmd_init)

    up = sub.add_parser("upsert")
    up.add_argument("--session", required=True)
    up.add_argument("--title")
    up.add_argument("--summary")
    up.add_argument("--action-items", dest="action_items")
    up.add_argument("--key-decisions", dest="key_decisions")
    up.add_argument("--status", choices=STATUS)
    up.add_argument("--project", help="comma-separated; subset of " + ", ".join(PROJECTS))
    up.add_argument("--type", choices=TYPES)
    up.add_argument("--device", choices=DEVICES)
    up.add_argument("--date", help="ISO-8601; defaults to now")
    up.add_argument("--notion-url", dest="notion_url")
    up.set_defaults(func=cmd_upsert)

    g = sub.add_parser("get")
    g.add_argument("--session", required=True)
    g.set_defaults(func=cmd_get)

    ls = sub.add_parser("list")
    ls.add_argument("--limit", type=int, default=20)
    ls.set_defaults(func=cmd_list)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
