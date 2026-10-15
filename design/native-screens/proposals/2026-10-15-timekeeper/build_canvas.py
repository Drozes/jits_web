#!/usr/bin/env python3
"""Merge the Oct 15 timekeeper page into a FRESH copy of the canvas index.

Usage: python3 build_canvas.py <fresh canvas.json> <out canvas.json>

Adds page `timekeeper` ("Proposed (Oct 15 Timekeeper)"), its boards (sizes from
boards_*.json), row-title notes and order entries. Every key outside this page
is copied unchanged; the script refuses to run if any P-TK board or tk-row note
already exists with a different page, or if the page would overlap itself.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE_ID = "timekeeper"
PAGE_NAME = "Proposed (Oct 15 Timekeeper)"
GAP_X = 120
ROW_GAP = 340  # room for the row title note (y - 280) above each row

ROWS = [
    ("Oct 15 timekeeper: map and rules", ["P-TK-00-Map", "P-TK-B-Rules"]),
    ("Today, flag OFF: the two-athlete match flow",
     ["P-TK-A1", "P-TK-A2", "P-TK-A3", "P-TK-A4", "P-TK-A5"]),
    ("Timekeeper mode (flag ON): pick a timekeeper and face-off",
     ["P-TK-B1", "P-TK-B2", "P-TK-B3", "P-TK-B4", "P-TK-B5", "P-TK-B6"]),
    ("Timekeeper mode (flag ON): live, result, drop-out, pushes",
     ["P-TK-B7", "P-TK-B8", "P-TK-B9", "P-TK-B10"]),
    ("Later and optional: phase 2 off-platform invite, merged ready for flag OFF",
     ["P-TK-B11", "P-TK-C1"]),
]


def load_boards():
    boards = {}
    for f in sorted(HERE.glob("boards_*.json")):
        data = json.loads(f.read_text())
        items = data if isinstance(data, list) else data.get("boards", data)
        if isinstance(items, dict):
            items = [dict(v, id=k) if isinstance(v, dict) else v for k, v in items.items()]
        for b in items:
            bid = b["id"].removesuffix(".dc.html")
            boards[bid] = {"w": int(b["w"]), "h": int(b["h"]), "title": b["title"]}
    on_disk = {p.name.removesuffix(".dc.html") for p in (HERE / "project").glob("P-TK-*.dc.html")}
    missing = on_disk - boards.keys()
    assert not missing, f"boards on disk without sizes: {missing}"
    return boards


def resolve(prefix, boards):
    hits = [b for b in boards if b == prefix or b.startswith(prefix + "-")]
    assert len(hits) == 1, f"{prefix}: expected one board, got {hits}"
    return hits[0]


def main(src, out):
    canvas = json.loads(Path(src).read_text())
    boards = load_boards()
    assert all(p["id"] != PAGE_ID for p in canvas["pages"]), "page already exists; update instead"
    for k, v in canvas["boards"].items():
        assert not k.startswith("P-TK-"), f"{k} already on canvas"
    for k in canvas["notes"]:
        assert not k.startswith("tk-row-"), f"{k} already on canvas"

    canvas["pages"].append({"id": PAGE_ID, "name": PAGE_NAME})
    y = 0
    used = set()
    for i, (title, prefixes) in enumerate(ROWS):
        x = 0
        row_h = 0
        ids = [resolve(p, boards) for p in prefixes]
        total_w = sum(boards[b]["w"] for b in ids) + GAP_X * (len(ids) - 1)
        canvas["notes"][f"tk-row-{i}"] = {
            "kind": "title1", "maxW": total_w, "page": PAGE_ID,
            "text": title, "w": 240, "x": 0, "y": y - 280,
        }
        for b in ids:
            meta = boards[b]
            key = f"{b}.dc.html"
            canvas["boards"][key] = {
                "h": meta["h"], "page": PAGE_ID, "title": meta["title"],
                "w": meta["w"], "x": x, "y": y,
            }
            canvas["order"].append(key)
            used.add(b)
            x += meta["w"] + GAP_X
            row_h = max(row_h, meta["h"])
        y += row_h + ROW_GAP
    unplaced = set(boards) - used
    assert not unplaced, f"boards not placed: {unplaced}"
    Path(out).write_text(json.dumps(canvas, indent=1, ensure_ascii=False) + "\n")
    print(f"page {PAGE_ID}: {len(used)} boards, {len(ROWS)} rows, height {y}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
