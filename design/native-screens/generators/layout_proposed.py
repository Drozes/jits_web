"""Adds the Proposed page to project/canvas.json, keeping every existing key (Thomas's notes included)."""
import json, os, re

P = os.environ.get("NATIVE_SCREENS_OUT", os.path.join(os.getcwd(), "project"))
cj = os.path.join(P, "canvas.json")
c = json.load(open(cj))


def size(f):
    s = open(os.path.join(P, f)).read()
    m = re.search(r'"\$preview":\{"width":(\d+),"height":(\d+)\}', s)
    return int(m[1]), int(m[2])


c["pages"] = [{"id": "current", "name": "Current app"}, {"id": "proposed", "name": "Proposed (Sept 30 review)"}]

TITLES = {
    "P-Setup-Who.dc.html": "Proposed: Setup 2 (weight + IG)",
    "P-Setup-Where.dc.html": "Proposed: Setup 3 (gym IG)",
    "P-Home.dc.html": "Proposed: Home",
    "P-Arena-Live.dc.html": "Proposed: Arena (ranked only)",
    "P-Challenge-Sheet.dc.html": "Proposed: Challenge modal",
    "P-Profile-Stats.dc.html": "Proposed: Stats",
    "P-Compare-Stats.dc.html": "Proposed: Compare stats",
    "P-Faceoff-Weight.dc.html": "Proposed: Face-off (confirm opponent weight)",
    "P-Result-Waiting.dc.html": "Proposed: Result waiting",
    "P-Confirm.dc.html": "Proposed: Confirm",
    "P-Verdict.dc.html": "Proposed: Verdict (no rematch)",
    "P-Notifications.dc.html": "Proposed: Notifications (featured)",
}
ROWS = [list(TITLES)[:6], list(TITLES)[6:]]

B = c["boards"]
w, h = size("00-Triage.dc.html")
B["00-Triage.dc.html"] = {"x": 0, "y": 0, "w": w, "h": h, "title": "Review triage: all items", "page": "proposed", "is_interactive": True}
x0, y = 1600, 0
for r, row in enumerate(ROWS):
    c["notes"][f"prop-row-{r}"] = {"x": x0, "y": y - 280, "text": ["Onboarding, Home, Arena, Stats", "Stats, match flow, notifications"][r],
                                   "kind": "title1", "maxW": 2740, "page": "proposed"}
    rowh = 0
    for i, f in enumerate(row):
        bw, bh = size(f)
        B[f] = {"x": x0 + i * 470, "y": y, "w": bw, "h": bh, "title": TITLES[f], "page": "proposed", "is_interactive": True}
        rowh = max(rowh, bh)
    y += rowh + 343
c["notes"]["prop-title"] = {"x": 0, "y": -280, "text": "Sept 30 review: triage + proposals", "kind": "title1", "maxW": 1440, "page": "proposed"}

order = [f for f in c["order"] if f in B and not f.startswith(("P-", "00-"))]
c["order"] = order + ["00-Triage.dc.html"] + [f for row in ROWS for f in row]
json.dump(c, open(cj, "w"), indent=2)
print(len(B), "boards;", {f: (B[f]["x"], B[f]["y"], B[f]["h"]) for f in B if f.startswith(("P-", "00-"))})
