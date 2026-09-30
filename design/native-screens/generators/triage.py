"""Generates project/00-Triage.dc.html: every item from Thomas's sticky-note review (2026-09-30)."""
import html, os, sys

OUT = os.path.join(os.environ.get("NATIVE_SCREENS_OUT", os.path.join(os.getcwd(), "project")), "00-Triage.dc.html")
H = int(os.environ.get("TRIAGE_H", "3000"))

# (board label, board file, Thomas's note, decision / reason, proposed board file or None)
ACCEPTED = [
    ("Home", "Main.dc.html", "Let's remove \"Current ELO Rating\". This should be self-explanatory.", "Drop the label from the hero Elo tile.", "P-Home.dc.html"),
    ("Home", "Main.dc.html", "Move the record on the bottom to be in the same box as the ELO RATING.", "W·L·D moves into the Elo tile; the separate Record section goes.", "P-Home.dc.html"),
    ("Home", "Main.dc.html", "Kill the \"Find a match\" box.", "Remove the Arena nudge card. The Arena tab covers that path.", "P-Home.dc.html"),
    ("Arena", "13-Arena-Live.dc.html", "Let's kill casual rolls. Every match is ranked. The [Roll] or [Casual Only] tag can be removed.", "Decided 9/30. Every match is ranked. App: remove casual tags and filters. Backend (jr_be): retire the casual match kind and its stakes path. Roll stays as the challenge button; only the Casual only tag goes.", "P-Arena-Live.dc.html"),
    ("Stats", "18-Profile-Stats.dc.html", "Let's get rid of the all vs ranked. They're all ranked.", "Follows from killing casual. Also removes the All / Ranked / Casual pills in Compare Stats.", "P-Profile-Stats.dc.html|P-Compare-Stats.dc.html"),
    ("Stats", "18-Profile-Stats.dc.html", "Not sure what this is saying. A dotted line graph showing ELO progression over the filtered timeline.", "Replace the milestone bar with an ELO progression line. Data already exists (get_elo_history).", "P-Profile-Stats.dc.html"),
    ("Stats", "18-Profile-Stats.dc.html", "Top submissions should be timeline filterable.", "Add a timeline filter (30D / 90D / 1Y / ALL) that the whole page follows.", "P-Profile-Stats.dc.html"),
    ("Stats", "18-Profile-Stats.dc.html", "There should be top submissions by losses as well.", "Wins / Losses toggle on top submissions.", "P-Profile-Stats.dc.html"),
    ("Challenge sheet", "15-Challenge-Sheet.dc.html", "Can we make the incoming challenge centered on the page and take over 75% of the page?", "Centered modal at about 75% height instead of a bottom sheet.", "P-Challenge-Sheet.dc.html"),
    ("Setup: who", "07-Setup-Who.dc.html", "Weight should be on this page.", "Move weight from step 3 to step 2.", "P-Setup-Who.dc.html"),
    ("Setup: who", "07-Setup-Who.dc.html", "Let's add in IG handle here as well.", "Optional Instagram handle. Backend: new athletes column.", "P-Setup-Who.dc.html"),
    ("Setup: where", "08-Setup-Where.dc.html", "Let's have a spot to add in the gym's IG.", "Optional gym Instagram field. Backend: new gyms column.", "P-Setup-Where.dc.html"),
    ("Face-off", "21-Faceoff-Weight.dc.html", "They need to confirm their opponent's weight. This might crowd source honesty.", "Each athlete confirms the opponent's weigh-in. Open: what a mismatch does.", "P-Faceoff-Weight.dc.html"),
    ("Result wait", "26-Result-Waiting.dc.html", "Let's not confirm later. Make them confirm before moving on.", "Remove \"Leave and confirm later\".", "P-Result-Waiting.dc.html"),
    ("Confirm", "27-Confirm.dc.html", "If they don't confirm result (close the app and leave), it's the same as confirming.", "Leaving counts as confirming; the auto-lock stays the default accept. The screen says so.", "P-Confirm.dc.html"),
    ("Confirm", "27-Confirm.dc.html", "We need a flag for people who repeatedly dispute results.", "Backend rule over match_disputes plus an admin surface. No screen change yet.", None),
    ("Verdict", "29-Verdict.dc.html", "Kill the rematch button. We don't want people farming each other for points.", "Decided 9/30. Remove the button. No backend protection for now (athletes can still challenge each other from the Arena).", "P-Verdict.dc.html"),
    ("Notifications", "42-Notifications-Panel.dc.html", "It would be cool if people got a notification when their match gets highlighted on our socials.", "New notification type. Needs a hook from the social media engine.", "P-Notifications.dc.html"),
    ("Feedback", "45-Feedback.dc.html", "I like this!", "Keep as is.", None),
    ("Help", "46-Help.dc.html", "Flag these to be updated for accuracy.", "\"You can always download it from your profile\" is false (no download UI). Recheck the 3-challenge cap and offline-on-background lines against the Mat Board.", None),
]
DECLINED = [
    ("Home: resume", "11-Home-Resume.dc.html", "How come there's a \"resume match\" setting here?", "Not a setting. The card only shows while a match is still open (e.g. the app was killed mid-match) so you can get back in. Keep.", None),
    ("Match detail", "32-Match-Detail.dc.html", "Interesting idea to have multiple angles of the same match.", "Already built: each athlete can record from their phone and the angle switcher appears. The timekeeper-as-main-camera idea moves to the timekeeper item below.", None),
    ("Practice", "41-Practice.dc.html", "Kill practice matches.", "Decided 9/30: keep. It is the only walkthrough new athletes get before their first ranked match. Rename is pending below.", None),
]
PENDING = [
    ("Practice", "41-Practice.dc.html", "(from 9/30 review) Rename Practice Match to Mock Match?", "Pick the name.", None),
    ("Home", "Main.dc.html", "Recent activity geolocated, plus members of your gym and friends regardless of location.", "Post-alpha. Needs feed scoping in the backend.", None),
    ("Home", "Main.dc.html", "We might need a \"follow\" option, post-alpha. You see who they've rolled with and when they're online.", "Post-alpha (Thomas). New follow graph.", None),
    ("Header chip", "Main.dc.html", "What does the number denote on the Go Live button? Should it be Online/Offline?", "It is athletes on the mat right now. Proposal: label it \"5 ON MAT\". Decide.", None),
    ("Ready check", "22-Ready-Check.dc.html", "We need the time keeper flow in here.", "New feature. matches.timekeeper_id exists from the sessions era but mobile does not use it. Thomas's note: 2 extra cameras could triple storage.", None),
    ("Reel viewer", "34-Highlight-Viewer.dc.html", "What is \"improve this reel\"?", "It opens feedback and regenerates the reel. Rename the button?", None),
    ("Highlights", "35-Highlight-Share.dc.html", "Player reels may be flagged as duplicates of our social cuts. Different cuts plus a \"WE ARE ELO RATED, ARE YOU?\" outro.", "Agree in principle: the risk is our brand account reposting athletes' clips. Thomas: \"something to think about\".", None),
    ("Match detail", "32-Match-Detail.dc.html", "Some of these could be premium features too.", "Needs a premium definition first.", None),
    ("Compare stats", "37-Compare-Stats.dc.html", "Premium feature?", "Needs a premium definition first.", None),
    ("Film Room", "31-Film-Room.dc.html", "We should have unlimited video storage as a premium feature.", "Needs a premium definition. Help already says free-tier retention may be limited.", None),
    ("Setup: where", "08-Setup-Where.dc.html", "Future: a look-up table that matches gyms to their IG automatically.", "Future (Thomas).", None),
]

STATUS = {
    "ACCEPTED": ("#22C55E", "rgba(34,197,94,0.12)"),
    "DECLINED": ("#EC6A74", "rgba(236,106,116,0.12)"),
    "PENDING": ("#F59E0B", "rgba(245,158,11,0.12)"),
}
MONO = "font-family: 'JetBrains Mono', monospace"
e = html.escape


def row(i, status, item):
    label, bfile, note, decision, pfile = item
    color, _ = STATUS[status]
    prop = (f'<span style="display: flex; flex-direction: column; gap: 6px">' + "".join(f'<a href="{pf}" style="{MONO}; font-size: 11px; font-weight: 700; letter-spacing: 1.12px; color: #E8EDF2; text-decoration: underline">{e(pf.replace(".dc.html", ""))}</a>' for pf in pfile.split("|")) + '</span>'
            if pfile else f'<span style="{MONO}; font-size: 11px; color: #575C68">none</span>')
    return f"""<div style="display: grid; grid-template-columns: 48px 150px minmax(0, 1fr) minmax(0, 1fr) 190px; column-gap: 20px; align-items: start; padding: 14px 20px; border-top: 1px solid rgba(107,114,128,0.20)">
<span style="{MONO}; font-size: 12px; color: #8D929D">{i:02d}</span>
<a href="{bfile}" style="{MONO}; font-size: 11px; font-weight: 700; letter-spacing: 1.12px; text-transform: uppercase; color: {color}">{e(label)}</a>
<span style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 20px; color: #E8EDF2">{e(note)}</span>
<span style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 20px; color: #9CA3AF">{e(decision)}</span>
{prop}
</div>"""


def section(title, status, items, start):
    color, bg = STATUS[status]
    rows = "\n".join(row(start + k, status, it) for k, it in enumerate(items))
    return f"""<section style="display: flex; flex-direction: column; background: #13151B; border: 1px solid rgba(107,114,128,0.45); border-radius: 4px">
<div style="display: flex; align-items: center; gap: 12px; padding: 16px 20px">
<span style="{MONO}; font-size: 11px; font-weight: 700; letter-spacing: 1.68px; color: {color}; background: {bg}; border: 1px solid {color}; border-radius: 3px; padding: 4px 8px">{status}</span>
<span style="font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 18px; color: #E8EDF2">{e(title)}</span>
<span style="{MONO}; font-size: 12px; color: #8D929D">{len(items)} ITEMS</span>
</div>
<div style="display: grid; grid-template-columns: 48px 150px minmax(0, 1fr) minmax(0, 1fr) 190px; column-gap: 20px; padding: 8px 20px; border-top: 1px solid rgba(107,114,128,0.45)">
<span style="{MONO}; font-size: 10px; letter-spacing: 1.68px; color: #8D929D">#</span>
<span style="{MONO}; font-size: 10px; letter-spacing: 1.68px; color: #8D929D">BOARD</span>
<span style="{MONO}; font-size: 10px; letter-spacing: 1.68px; color: #8D929D">THOMAS'S NOTE</span>
<span style="{MONO}; font-size: 10px; letter-spacing: 1.68px; color: #8D929D">DECISION / WHY</span>
<span style="{MONO}; font-size: 10px; letter-spacing: 1.68px; color: #8D929D">PROPOSED BOARD</span>
</div>
{rows}
</section>"""


total = len(ACCEPTED) + len(DECLINED) + len(PENDING)
body = "\n".join([
    section("Accepted", "ACCEPTED", ACCEPTED, 1),
    section("Declined", "DECLINED", DECLINED, 1 + len(ACCEPTED)),
    section("Pending discussion", "PENDING", PENDING, 1 + len(ACCEPTED) + len(DECLINED)),
])

doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Review triage: Thomas's notes</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&amp;family=DM+Sans:wght@400;500;700&amp;family=Inter:wght@400;500&amp;family=JetBrains+Mono:wght@400;500;700&amp;display=swap">
<style>
body{{margin:0;background:#0D0F14;font-family:'Inter',sans-serif;color:#E8EDF2}}
a{{color:#EC6A74;text-decoration:none}}a:hover{{color:#F0556B}}
</style>
</helmet>
<div style="width: 1440px; height: {H}px; box-sizing: border-box; background: #0D0F14; color: #E8EDF2; padding: 56px 64px; display: flex; flex-direction: column; gap: 28px; overflow: hidden">
<header style="display: flex; flex-direction: column; gap: 10px">
<span style="{MONO}; font-size: 11px; letter-spacing: 2.52px; color: #8D929D">DESIGN REVIEW · SEPT 30 2026 · STICKY NOTES FROM THOMAS</span>
<h1 style="margin: 0; font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 64px; line-height: 64px; letter-spacing: 0.56px; color: #E8EDF2">Review triage</h1>
<p style="margin: 0; max-width: 900px; font-size: 15px; line-height: 22px; color: #9CA3AF">Every item from the review, one row each. Board links open the current screen; proposed links open the redesign on this page. {total} items: {len(ACCEPTED)} accepted, {len(DECLINED)} declined, {len(PENDING)} pending.</p>
</header>
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1440,"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""
open(OUT, "w").write(doc)
print(total, len(ACCEPTED), len(DECLINED), len(PENDING))
