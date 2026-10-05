#!/usr/bin/env python3
"""Generates 38-Upload-States.dc.html ("Current app", board "Upload states") from shipped code at 487cc15.

Usage: python3 upload_states.py <height> <out .dc.html>   (canvas h is 2020)
Reviewed by an independent agent against apps/mobile on 2026-10-05. The code is the source of
truth; this script only records how the board was drawn.
"""
import sys

H = int(sys.argv[1]) if len(sys.argv) > 1 else 2200
OUT = sys.argv[2]

INK, INK2, INK3 = "#E8EDF2", "#9CA3AF", "#8D929D"
PLATE, PANEL = "#1E222B", "#262A34"
HAIR, STRONG = "rgba(107,114,128,0.45)", "rgba(107,114,128,0.62)"
NEG, AMBER, WIN = "#EC6A74", "#F59E0B", "#22C55E"
MONO = "font-family: 'JetBrains Mono', monospace"

SPINNER = (f'<svg role="img" aria-label="Loading" width="20" height="20" viewBox="0 0 20 20" style="flex-shrink: 0">'
           f'<circle cx="10" cy="10" r="7.5" fill="none" stroke="{INK2}" stroke-opacity="0.25" stroke-width="2"></circle>'
           f'<path d="M10 2.5 A7.5 7.5 0 0 1 17.5 10" fill="none" stroke="{INK2}" stroke-width="2" stroke-linecap="round"></path></svg>')
PAUSE = (f'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: {AMBER}">'
         '<circle cx="12" cy="12" r="10"></circle><line x1="10" x2="10" y1="15" y2="9"></line><line x1="14" x2="14" y1="15" y2="9"></line></svg>')
ALERT = (f'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: {NEG}">'
         '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>')


def section(label, sub=None):
    s = (f'  <div style="display: flex; flex-direction: row; align-items: center; gap: 10px; margin-top: 28px; margin-bottom: 10px">\n'
         f'    <h2 style="margin: 0; {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 2.52px; color: {INK2}; white-space: nowrap">{label}</h2>\n'
         f'    <div style="flex: 1; height: 1px; background: {HAIR}"></div>\n  </div>\n')
    if sub:
        s += f'  <div style="margin: -4px 0 10px 0; {MONO}; font-weight: 400; font-size: 10px; line-height: 13px; letter-spacing: 1.12px; color: {INK3}">{sub}</div>\n'
    return s


def tag(text, color):
    return (f'<div style="flex: 1; min-width: 0; {MONO}; font-weight: 400; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; '
            f'text-transform: uppercase; color: {color}; font-variant-numeric: tabular-nums">{text}</div>')


def pct(text):
    return f'<div style="{MONO}; font-weight: 400; font-size: 10px; line-height: 13px; color: {INK2}; font-variant-numeric: tabular-nums">{text}</div>'


def track(p, color):
    return (f'<div style="width: 100%; height: 1.75px; background: {STRONG}"><div style="width: {p}; height: 100%; background: {color}"></div></div>')


def helper(text):
    return f'<div style="font-family: \'Inter\', sans-serif; font-weight: 400; font-size: 12px; line-height: 16px; color: {INK2}">{text}</div>'


def btn_secondary(label, aria):
    return (f'<button aria-label="{aria}" style="min-height: 44px; box-sizing: border-box; padding: 8px 16px; border-radius: 3px; background: {PLATE}; '
            f'border: 1px solid {STRONG}; color: {INK}; font-family: \'DM Sans\', sans-serif; font-weight: 700; font-size: 14px; line-height: 18px; '
            f'letter-spacing: 1.12px; text-transform: uppercase; cursor: pointer; white-space: nowrap">{label}</button>')


def btn_ghost(label):
    return (f'<button style="min-height: 44px; box-sizing: border-box; padding: 8px 8px; border-radius: 3px; background: transparent; border: 0; '
            f'color: {INK}; font-family: \'DM Sans\', sans-serif; font-weight: 700; font-size: 13px; line-height: 17px; '
            f'letter-spacing: 1.12px; text-transform: uppercase; cursor: pointer; white-space: nowrap">{label}</button>')


def banner(border, rows, role=None):
    r = f' role="{role}"' if role else ""
    inner = "\n".join("    " + x for x in rows)
    return (f'  <div{r} style="width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 5.25px; border-radius: 2px; '
            f'background: {PLATE}; border: 1px solid {border}; padding: 7px 10.5px">\n{inner}\n  </div>\n')


def head_row(*items):
    return f'<div style="width: 100%; display: flex; flex-direction: row; align-items: center; gap: 7px">{"".join(items)}</div>'


def actions(*btns):
    return f'<div style="display: flex; flex-direction: row; gap: 7px">{"".join(btns)}</div>'


TRY = btn_secondary("Try again", "Try again: upload match video")

# ---------------------------------------------------------------- film cards
TILE = (f'<div aria-label="{{name}}" style="width: 40px; height: 40px; box-sizing: border-box; border-radius: 2px; border: 1px solid {STRONG}; '
        f'background: {PANEL}; display: flex; align-items: center; justify-content: center; font-family: \'DM Sans\', sans-serif; font-weight: 700; '
        f'font-size: 13px; letter-spacing: 1.12px; color: {INK}">{{ini}}</div>')


def plate_still(opp_full, opp_ini, caption):
    return (f'      <div style="position: absolute; inset: 0; background: {PLATE}; display: flex; flex-direction: column; align-items: center; justify-content: center">\n'
            f'        <div style="display: flex; flex-direction: row; align-items: center; gap: 8px">'
            + TILE.format(name="Marcus Reyes", ini="MR")
            + f'<div style="font-family: \'Bebas Neue\', sans-serif; font-size: 12px; color: {NEG}">VS</div>'
            + TILE.format(name=opp_full, ini=opp_ini) + '</div>\n'
            f'        <div style="margin-top: 12px; padding: 0 12px; text-align: center; {MONO}; font-weight: 500; font-size: 10px; line-height: 13px; '
            f'letter-spacing: 1.68px; color: {INK2}; font-variant-numeric: tabular-nums">{caption}</div>\n      </div>\n')


BADGE_TONES = {
    "amber": ("rgba(0,0,0,0.88)", AMBER, "rgba(245,158,11,0.7)"),
    "red": ("rgba(0,0,0,0.88)", "#F0556B", "rgba(240,85,107,0.7)"),
    "muted": ("rgba(0,0,0,0.88)", "rgba(232,237,242,0.72)", "rgba(255,255,255,0.40)"),
}


def badge(label, tone):
    bg, fg, bd = BADGE_TONES[tone]
    return (f'<div style="height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; display: flex; align-items: center; background: {bg}; '
            f'border: 1px solid {bd}; {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; '
            f'font-variant-numeric: tabular-nums; color: {fg}; white-space: nowrap">{label}</div>')


def bottom(letter, opp, line, date, photo):
    if photo:
        name_c, date_c = "#FFFFFF", "rgba(232,237,242,0.72)"
        col = {"W": WIN, "L": "#F0556B", "D": INK}[letter]
        bd = {"W": WIN, "L": "rgba(240,85,107,0.7)", "D": "rgba(255,255,255,0.40)"}[letter]
        fill = " background: rgba(0,0,0,0.45);"
    else:
        name_c, date_c = INK, INK2
        col = {"W": WIN, "L": NEG, "D": INK}[letter]
        bd = {"W": WIN, "L": NEG, "D": STRONG}[letter]
        fill = ""
    return (f'      <div style="position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 6px">\n'
            f'        <div style="display: flex; flex-direction: row; align-items: center; gap: 7px; min-width: 0">\n'
            f'          <div style="height: 20px; min-width: 20px; box-sizing: border-box; padding: 0 5px; border-radius: 2px; border: 1px solid {bd};{fill} display: flex; align-items: center; justify-content: center; {MONO}; font-weight: 700; font-size: 11px; line-height: 14px; color: {col}; font-variant-numeric: tabular-nums">{letter}</div>\n'
            f'          <div style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: \'DM Sans\', sans-serif; font-weight: 700; font-size: 13px; line-height: 17px; letter-spacing: 0.56px; text-transform: uppercase; color: {name_c}">{opp}</div>\n'
            f'        </div>\n'
            f'        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 6px">\n'
            f'          <div style="white-space: nowrap; overflow: hidden; {MONO}; font-weight: 700; font-size: 11px; line-height: 14px; letter-spacing: 0.56px; color: {col}; font-variant-numeric: tabular-nums">{line}</div>\n'
            f'          <div style="white-space: nowrap; {MONO}; font-weight: 500; font-size: 10px; line-height: 13px; letter-spacing: 1.12px; color: {date_c}; font-variant-numeric: tabular-nums">{date}</div>\n'
            f'        </div>\n      </div>\n')


def card(aria, body):
    return (f'    <a href="32-Match-Detail.dc.html" aria-label="{aria}" style="flex: 1; min-width: 0; aspect-ratio: 3 / 4; position: relative; overflow: hidden; '
            f'border-radius: 3px; border: 1px solid {HAIR}; background: {PLATE}; display: block; color: inherit">\n{body}    </a>\n')


def badges(*b):
    return (f'      <div style="position: absolute; top: 8px; right: 8px; left: 8px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px">'
            + "".join(b) + '</div>\n')


def retry_overlay():
    return (f'      <div style="position: absolute; left: 10px; right: 10px; top: 34%; display: flex; flex-direction: column; align-items: center">'
            + TRY + '</div>\n')


def top_bar(track_c, fill_c, p):
    return (f'      <div style="position: absolute; left: 0; right: 0; top: 0; height: 3px; background: {track_c}">'
            f'<div style="width: {p}; height: 3px; background: {fill_c}"></div></div>\n')


# 1. Uploading, over a photo (the other athlete's still): dimmed still, amber badge, top bar.
c1 = card("Won vs D. Okafor, SEP 27, ▲ +18 · 04:12, UPLOADING 42%",
          f'      <div style="position: absolute; inset: 0; background: {PANEL}; opacity: 0.38; display: flex; align-items: flex-start; justify-content: center; padding-top: 72px; box-sizing: border-box; {MONO}; font-weight: 500; font-size: 9px; letter-spacing: 2px; color: rgba(232,237,242,0.35)">OPENING STILL</div>\n'
          '      <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 58%; background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.88))"></div>\n'
          '      <div style="position: absolute; left: 10px; right: 10px; top: 38%; display: flex; flex-direction: column; align-items: center; gap: 6px">' + badge("UPLOADING 42%", "amber") + '</div>\n'
          + top_bar("rgba(255,255,255,0.18)", AMBER, "42%")
          + bottom("W", "D. Okafor", "▲ +18 · 04:12", "SEP 27", True))
# 2. Uploading, no still: plate caption, themed top bar.
c2 = card("Lost vs L. Tanaka, SEP 24, ▼ −11 · 06:00, UPLOADING 42%",
          plate_still("Leo Tanaka", "LT", "UPLOADING 42%")
          + top_bar("rgba(255,255,255,0.18)", AMBER, "42%")
          + bottom("L", "L. Tanaka", "▼ −11 · 06:00", "SEP 24", False))
# 3. Paused: amber badge, Try again.
c3 = card("Lost vs S. Whitfield, SEP 20, ▼ −9 · 05:31, UPLOAD PAUSED",
          plate_still("Sam Whitfield", "SW", "UPLOAD PAUSED")
          + badges(badge("UPLOAD PAUSED", "amber")) + retry_overlay()
          + bottom("L", "S. Whitfield", "▼ −9 · 05:31", "SEP 20", False))
# 4. Didn't upload, retryable: red badge, Try again.
c4 = card("Lost vs D. Okafor, SEP 06, ▼ −14 · 05:47, DIDN'T UPLOAD",
          plate_still("Dana Okafor", "DO", "DIDN'T UPLOAD")
          + badges(badge("DIDN'T UPLOAD", "red")) + retry_overlay()
          + bottom("L", "D. Okafor", "▼ −14 · 05:47", "SEP 06", False))
# 5. Didn't upload, terminal: grey badge, no action on the card.
c5 = card("Won vs L. Tanaka, AUG 30, ▲ +12 · 04:48, DIDN'T UPLOAD",
          plate_still("Leo Tanaka", "LT", "DIDN'T UPLOAD")
          + badges(badge("DIDN'T UPLOAD", "muted"))
          + bottom("W", "L. Tanaka", "▲ +12 · 04:48", "AUG 30", False))
# 6. No film.
c6 = card("Won vs J. Cruz, SEP 14, ▲ +7 · 03:05",
          plate_still("Jordan Cruz", "JC", "NO FILM RECORDED")
          + bottom("W", "J. Cruz", "▲ +7 · 03:05", "SEP 14", False))


def grid_row(a, b, label_a, label_b):
    lab = (f'  <div style="display: flex; flex-direction: row; gap: 16px; margin-bottom: 6px">'
           f'<div style="flex: 1; {MONO}; font-weight: 400; font-size: 10px; line-height: 13px; letter-spacing: 1.12px; color: {INK3}">{label_a}</div>'
           f'<div style="flex: 1; {MONO}; font-weight: 400; font-size: 10px; line-height: 13px; letter-spacing: 1.12px; color: {INK3}">{label_b}</div></div>\n')
    return lab + f'  <div style="display: flex; flex-direction: row; gap: 16px; margin-bottom: 16px">\n{a}{b}  </div>\n'


# ---------------------------------------------------------------- page
parts = []
parts.append(
    f'  <h1 style="margin: 0; font-family: \'Bebas Neue\', sans-serif; font-weight: 400; font-size: 40px; line-height: 44px; letter-spacing: 0.56px; color: {INK}">UPLOAD STATES</h1>\n'
    f'  <div style="margin-top: 6px; {MONO}; font-weight: 500; font-size: 11px; line-height: 14px; letter-spacing: 1.68px; color: {INK2}">THIS PHONE\'S MATCH VIDEO UPLOAD · VERDICT · MATCH PAGE · FILM ROOM</div>\n')

parts.append(section("VERDICT · FINISHING RECORDING"))
parts.append(banner(STRONG, [head_row(SPINNER, tag("Finishing recording", INK2))]))

parts.append(section("VERDICT · UPLOADING", "ON CELLULAR: THE CLIP SIZE LINE SHOWS"))
parts.append(banner(STRONG, [head_row(SPINNER, tag("Uploading match video", INK2), pct("42%")), track("42%", INK2),
                             helper("Keep ELO RATED open until your film uploads."),
                             f'<div style="{MONO}; font-weight: 400; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; text-transform: uppercase; color: {INK3}; font-variant-numeric: tabular-nums">On cellular · 412 MB</div>'],
                     role="progressbar"))

parts.append(section("UPLOAD PAUSED · AMBER", "RETRIES ON ITS OWN; TRY AGAIN RUNS IT NOW"))
parts.append(banner(AMBER, [head_row(PAUSE, tag("Upload paused", AMBER), pct("42%")), track("42%", AMBER),
                            helper("No connection right now. It picks up where it left off."), actions(TRY)]))

parts.append(section("DIDN'T UPLOAD · RED", "A TRY AGAIN CAN FIX IT"))
parts.append(banner(NEG, [head_row(ALERT, tag("Didn't upload", NEG)), helper("The upload didn't finish."), actions(TRY)]))

parts.append(section("DIDN'T UPLOAD · GREY", "TERMINAL: NO RETRY, THE CLIP IS STILL ON THE PHONE"))
parts.append(banner(STRONG, [head_row(tag("Didn't upload", INK3)), helper("This clip is too big to upload (2 GB max)."), actions(btn_ghost("Discard recording"))]))

parts.append(section("MATCH PAGE · UPLOAD CARD", "IN THE FILM SECTION, UNDER THE VERDICT; UPLOAD STARTING, NO % YET"))
parts.append(banner(STRONG, [head_row(SPINNER, tag("Uploading match video", INK2)),
                             helper("Keep ELO RATED open until your film uploads.")], role="progressbar"))

parts.append(section("FILM ROOM · GRID CARDS"))
parts.append(grid_row(c1, c2, "UPLOADING · OVER A STILL", "UPLOADING · NO STILL"))
parts.append(grid_row(c3, c4, "UPLOAD PAUSED", "DIDN'T UPLOAD · RED"))
parts.append(grid_row(c5, c6, "DIDN'T UPLOAD · GREY", "NO FILM"))

parts.append(section("LOCAL NOTIFICATION", "LEAVING THE APP MID-UPLOAD; IOS DRAWS THE BANNER"))
parts.append(
    f'  <div role="note" style="width: 100%; box-sizing: border-box; display: flex; flex-direction: row; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 8px; background: {PANEL}; border: 1px solid {HAIR}">\n'
    f'    <div aria-label="ELO RATED app icon" style="width: 38px; height: 38px; flex-shrink: 0; border-radius: 8px; background: {PLATE}; border: 1px solid {HAIR}; display: flex; align-items: center; justify-content: center; {MONO}; font-weight: 500; font-size: 8px; letter-spacing: 1px; color: rgba(232,237,242,0.35)">ICON</div>\n'
    f'    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">\n'
    f'      <div style="display: flex; flex-direction: row; justify-content: space-between; gap: 8px">'
    f'<div style="font-family: \'Inter\', sans-serif; font-weight: 500; font-size: 13px; line-height: 17px; color: {INK}">Your match film isn\'t uploaded yet</div>'
    f'<div style="font-family: \'Inter\', sans-serif; font-weight: 400; font-size: 12px; line-height: 17px; color: {INK2}; flex-shrink: 0">now</div></div>\n'
    f'      <div style="font-family: \'Inter\', sans-serif; font-weight: 400; font-size: 13px; line-height: 17px; color: {INK}">Open ELO RATED to finish uploading it.</div>\n'
    f'    </div>\n  </div>\n')

body = "".join(parts)
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Upload states</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
body{{margin:0;background:#0D0F14;font-family:'Inter',sans-serif;color:#E8EDF2;line-height:1.25}}
a{{color:#EC6A74;text-decoration:none}}a:hover{{color:#F0556B}}
</style>
</helmet>
<div style="width: 390px; height: {H}px; box-sizing: border-box; background: #0D0F14; color: #E8EDF2; display: flex; flex-direction: column; overflow: hidden; position: relative; padding: 32px 16px 0 16px">
{body}</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''
open(OUT, "w").write(html)
print("wrote", OUT, H)
