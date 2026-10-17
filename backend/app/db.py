"""SQLite inventory store. One intake = one uploaded video; it can produce several items."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS intakes (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    donor_name TEXT, donor_zip TEXT, donor_contact TEXT,
    provider TEXT, mode TEXT, duration REAL,
    transcript TEXT, analysis_json TEXT, frames_json TEXT,
    video_url TEXT
);
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    intake_id TEXT NOT NULL REFERENCES intakes(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    title TEXT, category TEXT, room TEXT, quantity INTEGER,
    condition_grade TEXT,
    ai_outcome TEXT NOT NULL,
    status TEXT NOT NULL,
    human_verified INTEGER NOT NULL DEFAULT 0,
    reviewer_note TEXT DEFAULT '',
    est_weight_lbs REAL,
    thumb_url TEXT,
    item_json TEXT, decision_json TEXT, defect_frames_json TEXT
);
CREATE INDEX IF NOT EXISTS items_status ON items(status);
"""

STATUSES = ("pledged", "needs_review", "declined", "in_warehouse", "assigned", "delivered")
# The AI outcome only sets where an item *starts*; volunteers move it from there.
INITIAL_STATUS = {"accept": "pledged", "review": "needs_review", "decline": "declined"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class DB:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def conn(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.path)
        c.row_factory = sqlite3.Row
        try:
            yield c
            c.commit()
        finally:
            c.close()

    def insert_intake(self, row: dict) -> None:
        with self.conn() as c:
            c.execute(
                f"INSERT INTO intakes ({','.join(row)}) VALUES ({','.join('?' * len(row))})", list(row.values())
            )

    def insert_item(self, row: dict) -> None:
        with self.conn() as c:
            c.execute(
                f"INSERT INTO items ({','.join(row)}) VALUES ({','.join('?' * len(row))})", list(row.values())
            )

    def get_intake(self, intake_id: str) -> dict | None:
        with self.conn() as c:
            r = c.execute("SELECT * FROM intakes WHERE id=?", (intake_id,)).fetchone()
            if not r:
                return None
            items = c.execute("SELECT * FROM items WHERE intake_id=? ORDER BY rowid", (intake_id,)).fetchall()
        out = _intake(r)
        out["items"] = [_item(i) for i in items]
        return out

    def list_items(self, status: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM items", []
        if status:
            q, args = q + " WHERE status=?", [status]
        with self.conn() as c:
            rows = c.execute(q + " ORDER BY created_at DESC, rowid DESC", args).fetchall()
        return [_item(r) for r in rows]

    def get_item(self, item_id: str) -> dict | None:
        with self.conn() as c:
            r = c.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        return _item(r) if r else None

    def update_item(self, item_id: str, fields: dict) -> dict | None:
        if fields:
            fields = {**fields, "updated_at": now()}
            with self.conn() as c:
                c.execute(
                    f"UPDATE items SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?",
                    [*fields.values(), item_id],
                )
        return self.get_item(item_id)

    def stats(self) -> dict:
        with self.conn() as c:
            by_status = dict(c.execute("SELECT status, COUNT(*) FROM items GROUP BY status").fetchall())
            diverted = c.execute(
                "SELECT COALESCE(SUM(est_weight_lbs),0) FROM items WHERE status IN ('pledged','in_warehouse','assigned','delivered')"
            ).fetchone()[0]
            intakes = c.execute("SELECT COUNT(*) FROM intakes").fetchone()[0]
        return {"by_status": by_status, "est_lbs_diverted": diverted, "intakes": intakes}


def _intake(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["analysis"] = json.loads(d.pop("analysis_json") or "{}")
    d["frames"] = json.loads(d.pop("frames_json") or "[]")
    return d


def _item(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["item"] = json.loads(d.pop("item_json") or "{}")
    d["decision"] = json.loads(d.pop("decision_json") or "{}")
    d["defect_frames"] = json.loads(d.pop("defect_frames_json") or "[]")
    d["human_verified"] = bool(d["human_verified"])
    return d
