#!/usr/bin/env python3
"""Promote a staged `generate-app-icons` workflow run into the next numbered batch.

The workflow writes its 18 SVGs to `design/icon-options/_incoming/svg/` (a neutral
staging dir, so a rerun can never clobber a published batch). This script moves that
staged output into the next `batch<N>/`, writes its `manifest.json` from the
workflow's returned JSON, and rebuilds the web registry.

Usage:
  python3 design/icon-options/finalize-batch.py \
      --result /path/to/task-output.json \
      --label "Round 4" [--date 2026-06-02] [--staging _incoming]

`--result` is the workflow task's output file (the JSON with {batch,outdir,themes:[
{themeKey,themeTitle,icons:[{file,name,concept}],curate:{results:[{file,brandScore}]}}]}).
After running, the page shows the new batch as a fresh dated section.
"""
import argparse
import datetime
import glob
import json
import os
import re
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))


def next_batch_num():
    nums = []
    for d in glob.glob(os.path.join(HERE, "batch*")):
        m = re.search(r"batch(\d+)$", d)
        if m and os.path.isdir(d):
            nums.append(int(m.group(1)))
    return (max(nums) + 1) if nums else 1


def load_result(path):
    with open(path) as f:
        d = json.load(f)
    r = d.get("result", d) if isinstance(d, dict) else d
    if isinstance(r, str):
        r = json.loads(r)
    if "themes" not in r:
        raise SystemExit(f"{path}: not a workflow result (no 'themes')")
    return r


def build_manifest(result, num, label, date):
    icons = []
    for t in result["themes"]:
        cur = {x["file"]: x for x in (t.get("curate") or {}).get("results", [])} if t.get("curate") else {}
        for ic in t["icons"]:
            icons.append(
                {
                    "theme": t["themeKey"],
                    "themeTitle": t["themeTitle"],
                    "file": ic["file"],
                    "name": ic["name"],
                    "concept": ic["concept"],
                    "score": cur.get(ic["file"], {}).get("brandScore"),
                }
            )
    return {
        "batch": f"batch{num}",
        "num": num,
        "label": label,
        "date": date,
        "themes": [{"key": t["themeKey"], "title": t["themeTitle"]} for t in result["themes"]],
        "icons": icons,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--result", required=True, help="workflow task-output JSON path")
    ap.add_argument("--label", required=True, help="batch label, e.g. 'Round 4'")
    ap.add_argument("--date", default=datetime.date.today().isoformat(), help="ISO date (default: today)")
    ap.add_argument("--staging", default="_incoming", help="staging dir name under icon-options/")
    args = ap.parse_args()

    staging_svg = os.path.join(HERE, args.staging, "svg")
    staged = sorted(glob.glob(os.path.join(staging_svg, "*.svg")))
    if not staged:
        raise SystemExit(f"no staged SVGs in {staging_svg} (did the workflow run?)")

    result = load_result(args.result)
    expected = {ic["file"] for t in result["themes"] for ic in t["icons"]}
    found = {os.path.splitext(os.path.basename(p))[0] for p in staged}
    missing = expected - found
    if missing:
        raise SystemExit(f"staged dir missing {len(missing)} SVGs from result: {sorted(missing)}")

    num = next_batch_num()
    batch_dir = os.path.join(HERE, f"batch{num}")
    dst_svg = os.path.join(batch_dir, "svg")
    os.makedirs(dst_svg, exist_ok=True)
    for p in staged:
        shutil.move(p, os.path.join(dst_svg, os.path.basename(p)))

    manifest = build_manifest(result, num, args.label, args.date)
    with open(os.path.join(batch_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"promoted {len(staged)} SVGs + manifest -> batch{num} ('{args.label}', {args.date})")

    # rebuild the web registry so the new batch appears on the page
    subprocess.run(["python3", os.path.join(HERE, "build-registry.py")], check=True)


if __name__ == "__main__":
    main()
