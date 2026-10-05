"""Generates the "Proposed (Oct 4 video status)" boards (jits-n2im.24, jits-n2im.2).

Static markup only: this script writes .dc.html files; nothing in the boards is script-built.
Usage: python3 generate.py [heights.json]
  heights.json (optional) maps board file -> measured height for auto-height boards.
Writes project/<board>.dc.html and canvas-delta.json next to this file.
Copy follows COPY-DECK.md. Tokens: apps/mobile/lib/tokens.ts (dark). Sample data: BUILD-SPEC.md.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "project")
os.makedirs(OUT, exist_ok=True)
SRC = os.environ.get("CANVAS_SRC")  # folder holding the live canvas's project/*.dc.html (read only)
# Owner decision 2026-10-05: keep both shipped nouns. In-app screens say TERM_APP (shipped
# highlight-copy.ts); push and bell bodies say TERM_NOTIFY (shipped highlight-payload.ts, discovery.ts).
# Push and bell TITLES stay the shipped literal "Your highlight is ready".
# Boards write %TERM% / %Term% (app) and %NTERM% (notifications).
TERM_APP = "highlight"
TERM_NOTIFY = "reel"
TERM = TERM_APP
HEIGHTS = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else {}

# ---- tokens (dark) ----
VOID, PANEL, PLATE, BRIGHT = "#0D0F14", "#13151B", "#1E222B", "#262A34"
INK, INK2, INK3 = "#E8EDF2", "#9CA3AF", "#8D929D"
RED, NEG, AMBER, GREEN = "#E63946", "#EC6A74", "#F59E0B", "#22C55E"
HL, HLF, HLS = "rgba(107,114,128,0.45)", "rgba(107,114,128,0.20)", "rgba(107,114,128,0.62)"
AMBER_RULE = "rgba(245,158,11,0.7)"
MONO, DM, INTER, BEBAS = "'JetBrains Mono', monospace", "'DM Sans', sans-serif", "'Inter', sans-serif", "'Bebas Neue', sans-serif"
CLS = {"progress": INK2, "waiting": AMBER, "done": INK, "act": NEG, "info": INK3}

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'

# ---- lucide icons (24 grid, stroke 2) ----
I = {
    "check": '<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>',
    "alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    "upload": '<path d="M12 3v12"></path><path d="m17 8-5-5-5 5"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>',
    "loader": '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>',
    "pause": '<rect x="14" y="4" width="4" height="16" rx="1"></rect><rect x="6" y="4" width="4" height="16" rx="1"></rect>',
    "clock": '<circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>',
    "minus": '<circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path>',
    "chev_r": '<path d="m9 18 6-6-6-6"></path>',
    "chev_l": '<path d="m15 18-6-6 6-6"></path>',
    "x": '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    "rotate": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path>',
    "vol": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path>',
    "volx": '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><line x1="22" x2="16" y1="9" y2="15"></line><line x1="16" x2="22" y1="9" y2="15"></line>',
    "max": '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" x2="14" y1="3" y2="10"></line><line x1="3" x2="10" y1="21" y2="14"></line>',
    "qr": '<rect width="5" height="5" x="3" y="3" rx="1"></rect><rect width="5" height="5" x="16" y="3" rx="1"></rect><rect width="5" height="5" x="3" y="16" rx="1"></rect><path d="M21 16h-3a2 2 0 0 0-2 2v3"></path><path d="M21 21v.01"></path><path d="M12 7v3a2 2 0 0 1-2 2H7"></path><path d="M3 12h.01"></path><path d="M12 3h.01"></path><path d="M12 16v.01"></path><path d="M16 12h1"></path><path d="M21 12v.01"></path><path d="M12 21v-1"></path>',
    "scan": '<path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><path d="M7 12h10"></path>',
    "clapper": '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"></path><path d="m6.2 5.3 3.1 3.9"></path><path d="m12.4 3.4 3.1 4"></path><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>',
    "film": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M7 3v18"></path><path d="M3 7.5h4"></path><path d="M3 12h18"></path><path d="M3 16.5h4"></path><path d="M17 3v18"></path><path d="M17 7.5h4"></path><path d="M17 16.5h4"></path>',
    "video": '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect>',
    "userplus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" x2="19" y1="8" y2="14"></line><line x1="22" x2="16" y1="11" y2="11"></line>',
    "timer": '<line x1="10" x2="14" y1="2" y2="2"></line><line x1="12" x2="15" y1="14" y2="11"></line><circle cx="12" cy="14" r="8"></circle>',
    "play": '<polygon points="6 3 20 12 6 21 6 3"></polygon>',
    "bell": '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>',
}


def ic(name, size=16, color="currentColor", sw=2, style=""):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: block; flex-shrink: 0{"; " + style if style else ""}">{I[name]}</svg>')


# ---- text atoms ----
def mono(t, size=10, color=INK3, w=500, ls=1.68, caps=True, extra=""):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<span style="font-family: {MONO}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.3)}px; '
            f'letter-spacing: {ls}px; font-variant-numeric: tabular-nums; {tt}color: {color}{"; " + extra if extra else ""}">{t}</span>')


def body(t, size=12, color=INK2, w=400, extra=""):
    return (f'<span style="font-family: {INTER}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.35)}px; '
            f'color: {color}{"; " + extra if extra else ""}">{t}</span>')


def heading(t, size=13, color=INK, ls=0.56, caps=True, extra=""):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<span style="font-family: {DM}; font-weight: 700; font-size: {size}px; line-height: {round(size * 1.3)}px; '
            f'letter-spacing: {ls}px; {tt}color: {color}{"; " + extra if extra else ""}">{t}</span>')


def track(pct, color=INK2):
    return (f'<div aria-hidden="true" style="height: 2px; background: {HLS}; position: relative">'
            f'<div style="position: absolute; left: 0; top: 0; bottom: 0; width: {pct}%; background: {color}"></div></div>')


def btn_secondary(label, h=44, aria=None, extra=""):
    a = f' aria-label="{aria}"' if aria else ""
    return (f'<button type="button"{a} style="min-height: {h}px; box-sizing: border-box; padding: 0 12px; border: 1px solid {HLS}; '
            f'border-radius: 3px; background: {BRIGHT}; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; '
            f'font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; letter-spacing: 1.12px; text-transform: uppercase; '
            f'color: {INK}; white-space: nowrap; flex-shrink: 0{"; " + extra if extra else ""}">{label}</button>')


def tag(t, color, border=None, bg="transparent"):
    b = border or color
    return (f'<span style="height: 20px; box-sizing: border-box; padding: 0 7px; display: inline-flex; align-items: center; border: 1px solid {b}; '
            f'border-radius: 2px; background: {bg}; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; '
            f'font-variant-numeric: tabular-nums; text-transform: uppercase; color: {color}; white-space: nowrap; flex-shrink: 0">{t}</span>')


def caption(t):
    """State label above a sample on a state sheet (mono, ink-3)."""
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 8px">{mono(t, 10, INK3, 700, 2.52)}'
            f'<div style="flex: 1; height: 1px; background: {HLF}"></div></div>')


def sheet_title(t, sub=None):
    s = f'<h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 18px; line-height: 23px; color: {INK}">{t}</h1>'
    if sub:
        s += f'<p style="margin: 0">{body(sub, 12, INK2)}</p>'
    return f'<div style="display: flex; flex-direction: column; gap: 6px">{s}</div>'


# ---- Film status (the source-of-truth component) ----
GLYPH = {"progress": "upload", "waiting": "clock", "done": "check", "act": "alert", "info": "minus"}


def angle_row(label, state_tag, cls, helper=None, pct=None, right=None, action=None, tk=False, glyph=None, href=None, last=False):
    col = CLS[cls]
    g = ic(glyph or GLYPH[cls], 16, col)
    if glyph == "loader":
        g = ic("loader", 16, col)
    lab = heading(label, 13, INK, 0.56)
    if tk:
        lab += tag("Timekeeper", INK2, HLS)
    lines = (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px; flex-wrap: wrap">{lab}</div>'
             f'{mono(state_tag, 10, col, 700, 1.68)}')
    if helper:
        lines += f'<p style="margin: 0">{body(helper, 12, INK2)}</p>'
    if pct is not None:
        lines += f'<div style="padding-top: 3px">{track(pct)}</div>'
    r = ""
    if pct is not None and right is None:
        r = mono(f"{pct}%", 13, INK2, 700, 0, False)
    elif right:
        r = right
    if action:
        r = (r + action) if r else action
    border = "" if last else f"border-bottom: 1px solid {HL}; "
    inner = (f'<span style="width: 16px; padding-top: 1px; flex-shrink: 0">{g}</span>'
             f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">{lines}</span>')
    if r:
        inner += f'<span style="display: flex; flex-direction: row; align-items: center; gap: 8px; flex-shrink: 0">{r}</span>'
    style = f'display: flex; flex-direction: row; align-items: flex-start; gap: 10px; padding: 12px 0; {border}color: {INK}'
    if href:
        return f'<a href="{href}" aria-label="Watch {label.replace("Your", "your")}" style="{style}">{inner}</a>'
    al = f"{label}, {state_tag.lower()}" + (f", {pct} percent" if pct is not None else "")
    role = f' role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="{pct}"' if pct is not None else ' role="group"'
    return f'<div{role} aria-label="{al}" style="{style}">{inner}</div>'


def watch_right(dur):
    return (mono(dur, 12, INK2, 500, 0, False) + ic("chev_r", 16, INK2))


def try_again(what="upload match video"):
    return btn_secondary("Try again", 44, f"Try again: {what}")


def film_status(phase_tag, phase_cls, line, helper, rows, title="Film status", countdown_aria=None):
    col = CLS[phase_cls]
    ptag = tag(phase_tag, col, AMBER_RULE if phase_cls == "waiting" else (HLS if phase_cls in ("done", "info", "progress") else col))
    if countdown_aria:
        ptag = ptag.replace("<span style=", f'<span aria-label="{countdown_aria}" style=', 1)
    head = (f'<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 10px">'
            f'<h2 style="margin: 0; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 2.52px; text-transform: uppercase; color: {INK}">{title}</h2>{ptag}</div>')
    txt = f'<p style="margin: 0">{body(line, 14, INK, 500)}</p>'
    if helper:
        txt += f'<p style="margin: 0">{body(helper, 12, INK2)}</p>'
    rows_html = "".join(rows)
    return (f'<section aria-label="{title}" style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px 14px 2px 14px; '
            f'display: flex; flex-direction: column; gap: 8px">{head}<div style="display: flex; flex-direction: column; gap: 4px">{txt}</div>'
            f'<div style="border-top: 1px solid {HL}; margin-top: 4px">{rows_html}</div></section>')


# ---- the app-wide upload strip (UploadDock) ----
def dock(state, pct=42, jobs=1, href="P-VS-07-Match-Detail.dc.html", helper=None):
    if state == "uploading":
        lab = "Uploading match video" if jobs == 1 else f"Uploading {jobs} match videos"
        lead, col = ic("upload", 14, INK2), INK2
        mid = mono(lab, 10, INK, 700, 1.68)
        right = mono(f"{pct}%", 12, INK, 700, 0, False) + ic("chev_r", 14, INK2)
        bar = f'<div style="position: absolute; left: 0; right: 0; bottom: 0">{track(pct)}</div>'
        aria = f"{lab}, {pct} percent. Opens the match."
        act = ""
    elif state == "pending":
        lead, mid = ic("loader", 14, INK2), mono("Preparing upload", 10, INK, 700, 1.68)
        right, bar, aria, act = ic("chev_r", 14, INK2), "", "Preparing upload. Opens the match.", ""
    elif state == "paused":
        lead = ic("pause", 14, AMBER)
        mid = (f'<span style="display: flex; flex-direction: column; gap: 2px">{mono("Upload paused", 10, AMBER, 700, 1.68)}'
               f'{body("No connection right now. It picks up where it left off.", 11, INK2)}</span>')
        right, bar, aria = "", "", "Upload paused. Opens the match."
        act = try_again()
    elif state == "failed":
        lead = ic("alert", 14, NEG)
        mid = (f'<span style="display: flex; flex-direction: column; gap: 2px">{mono("Didn&#39;t upload", 10, NEG, 700, 1.68)}'
               f'{body(helper or "The upload didn&#39;t finish.", 11, INK2)}</span>')
        right, bar, aria = "", "", "Your match video didn&#39;t upload. Opens the match."
        act = try_again()
    elif state == "terminal":
        lead = ic("minus", 14, INK3)
        mid = (f'<span style="display: flex; flex-direction: column; gap: 2px">{mono("Didn&#39;t upload", 10, INK2, 700, 1.68)}'
               f'{body("The clip isn&#39;t on this phone anymore.", 11, INK2)}</span>')
        right, bar, aria, act = mono("Details", 10, INK, 700, 1.68) + ic("chev_r", 14, INK2), "", "Your match video didn&#39;t upload. The clip isn&#39;t on this phone anymore. Details.", ""
    else:  # uploaded
        lead, mid = ic("check", 14, INK), mono("Match video uploaded", 10, INK, 700, 1.68)
        right, bar, aria, act = "", "", "Match video uploaded.", ""
    link = (f'<a href="{href}" aria-label="{aria}" style="flex: 1; min-width: 0; min-height: 44px; display: flex; flex-direction: row; align-items: center; gap: 8px; color: {INK}">'
            f'{lead}<span style="flex: 1; min-width: 0; display: flex">{mid}</span>{right}</a>')
    return (f'<div style="position: relative; flex-shrink: 0; box-sizing: border-box; background: {PANEL}; border-top: 1px solid {HLS}; '
            f'padding: 0 14px; display: flex; flex-direction: row; align-items: center; gap: 10px">{link}{act}{bar}</div>')


def compact_line(state, pct=42):
    if state == "uploading":
        return (f'<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px 0">'
                f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px">{ic("upload", 12, INK2)}'
                f'<span style="flex: 1">{mono("Your angle: uploading", 10, INK2, 500, 1.68)}</span>{mono(f"{pct}%", 10, INK2, 700, 0, False)}</div>{track(pct)}</div>')
    if state == "paused":
        return (f'<button type="button" aria-label="Your angle: paused. Try again" style="display: flex; flex-direction: row; align-items: center; gap: 7px; min-height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; width: 100%">'
                f'{ic("pause", 12, AMBER)}<span style="flex: 1; text-align: left">{mono("Your angle: paused", 10, AMBER, 500, 1.68)}</span>'
                f'{mono("Try again", 10, INK, 700, 1.68)}</button>')
    if state == "failed":
        return (f'<button type="button" aria-label="Your angle: didn&#39;t upload. Try again" style="display: flex; flex-direction: row; align-items: center; gap: 7px; min-height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; width: 100%">'
                f'{ic("alert", 12, NEG)}<span style="flex: 1; text-align: left">{mono("Your angle: didn&#39;t upload", 10, NEG, 500, 1.68)}</span>'
                f'{mono("Try again", 10, INK, 700, 1.68)}</button>')
    if state == "terminal":
        return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px; padding: 8px 0">{ic("minus", 12, INK3)}'
                f'{mono("Your angle: didn&#39;t upload", 10, INK3, 500, 1.68)}</div>')
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px; padding: 8px 0">{ic("check", 12, INK)}'
            f'{mono("Your angle: uploaded", 10, INK, 500, 1.68)}</div>')


# ---- page shell ----
def page(title, w, h, inner, root_extra=""):
    inner = inner.replace("%NTERM%", TERM_NOTIFY).replace("%TERM%", TERM).replace("%Term%", TERM.capitalize()).replace("%term%", TERM)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
body{{margin:0;background:#0D0F14;font-family:'Inter',sans-serif;color:#E8EDF2}}
a{{color:#EC6A74;text-decoration:none}}a:hover{{color:#F0556B}}
</style>
</helmet>
<div style="width: {w}px; height: {h}px; box-sizing: border-box; background: {VOID}; color: {INK}; display: flex; flex-direction: column; overflow: hidden; position: relative{"; " + root_extra if root_extra else ""}">
{inner}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''


BOARDS = []  # (file, title, w, h_fixed_or_None, html_fn)


def board(file, title, w=390, h=None):
    def deco(fn):
        BOARDS.append((file, title, w, h, fn))
        return fn
    return deco


def sheet(inner):
    """Auto-height state sheet body."""
    return f'<div style="padding: 47px 16px 40px 16px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0">{inner}</div>'


def app_header(t, back="Main.dc.html"):
    return (f'<header style="flex-shrink: 0; box-sizing: border-box; height: 103px; padding: 47px 4px 0; background: {PANEL}; border-bottom: 1px solid {HL}; '
            f'display: flex; flex-direction: row; align-items: center">'
            f'<a href="{back}" aria-label="Go back" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: {INK2}">{ic("chev_l", 20, INK2)}</a>'
            f'<h1 style="flex: 1; margin: 0; text-align: center; font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}">{t}</h1>'
            f'<span style="width: 44px"></span></header>')


# ---------------- shared samples ----------------
ME, OPP, TK = "Your angle", "D. Okafor's angle", "J. Cruz's angle"

# ========== shared copy (one string per state, COPY-DECK v2) ==========
KEEP_OPEN = "Keep ELO RATED open until your film uploads."
NO_CONN = "No connection right now. It picks up where it left off."
OPP_QUIET = "We haven&#39;t heard from D. Okafor&#39;s phone for a few minutes. It picks up where it left off."
TK_QUIET = "We haven&#39;t heard from J. Cruz&#39;s phone for a few minutes. It picks up where it left off."
OPP_WAIT = "It uploads when ELO RATED is open on D. Okafor&#39;s phone."
UNTIL = "It can still be added to your %TERM% until 9:42 PM."
WAIT1_HELP = "Your %TERM% uses it if it arrives. If not, we build it from what&#39;s in."
WAITN_HELP = "Your %TERM% uses them if they arrive. If not, we build it from what&#39;s in."
USUAL = "Usually 1 to 3 minutes. We&#39;ll let you know."


def no_rows(fs):
    return fs.replace(f'<div style="border-top: 1px solid {HL}; margin-top: 4px"></div>', '<div style="height: 12px"></div>')


# ========== Board 00: placement map (1440 wide) ==========
@board("P-VS-00-Map.dc.html", "Video status placement map (states x surfaces)", 1440)
def b00():
    cols = ["State / phase", "Upload strip", "Compact line", "Verdict", "Match detail: Film status", "Film Room card", "%Term% card", "Push (one per athlete)", "Bell"]
    R = [
        ("This phone: preparing / uploading", "Uploading match video 42%", "Your angle: uploading 42%", "Row: Uploading 42%", "Row: Uploading 42%", "Overlay UPLOADING 42% + track", "", "", ""),
        ("This phone: paused (auto retry)", "Upload paused + Try again", "Your angle: paused + Try again", "Row + Try again", "Row + Try again", "Badge UPLOAD PAUSED", "", "Device-local notification only", ""),
        ("This phone: failed, retryable", "Didn&#39;t upload + Try again", "Your angle: didn&#39;t upload + Try again", "Row Didn&#39;t upload + Try again (red)", "Same", "Badge DIDN&#39;T UPLOAD + Try again", "", "", ""),
        ("This phone: failed, nothing to do", "Didn&#39;t upload + Details (grey)", "Your angle: didn&#39;t upload (grey)", "Row Didn&#39;t upload (grey)", "Same", "No badge", "", "", ""),
        ("Your angle on another device", "", "", "Row, no Try again: open the phone that recorded", "Same", "Phase badge", "", "", ""),
        ("Other angle: waiting / uploading / paused", "", "", "Row", "Row", "Phase badge", "", "", ""),
        ("Any angle: processing", "", "", "Row: Processing", "Row: Processing", "Phase badge (never PROCESSING)", "", "", ""),
        ("Any angle: ready", "", "", "Row: Ready to watch", "Row, tap to watch", "Phase badge", "", "", ""),
        ("Angle: not used / didn&#39;t upload (final)", "", "", "Row (grey)", "Row (grey)", "Phase badge", "", "", ""),
        ("No video yet (grace, 15 min)", "", "", "No video yet.", "Same", "None", "", "", ""),
        ("Phase: collecting", "", "", "Your film is on its way.", "Same", "UPLOADING", "", "", ""),
        ("Phase: waiting_for_angle", "", "", "Waiting up to 10 min for ... 8:12 LEFT", "Same", "WAITING 8:12", "", "", ""),
        ("Phase: building", "", "", "Building your %TERM% from 2 angles.", "Same", "BUILDING %TERM%", "Steps", "", ""),
        ("Phase: ready", "", "", "Film and %TERM% ready. CTA: Watch film", "Same", "NEW, then BREAKDOWN READY", "Player + mute", "Your highlight is ready / Your %NTERM% vs D. Okafor is ready. Tap to watch.", "Same title, body ...is ready to watch."),
        ("Phase: no_film", "", "", "No film for this match.", "Same + reason", "NO FILM", "", "No film for your match (replaces the %NTERM% push)", "Same title"),
        ("After dispatch, other angle pending (24 h)", "", "", "Row + until 9:42 PM", "Same", "", "", "Never", "Never"),
        ("Late angle added", "", "", "", "Helper: updated with it", "", "Updated with D. Okafor&#39;s angle.", "Never", "Never"),
        ("Late angle after share / edit", "", "", "", "Helper: you can make a new version", "", "New angle available. Make a new version", "Never", "Never"),
        ("Late window closed", "", "", "Row: Not in your %TERM%", "Same", "", "", "", ""),
        ("Film window closed, nothing usable (film_window_until)", "", "", "No film for this match.", "Same + None of the video came in.", "NO FILM", "", "No film for your match", "Same title"),
        ("User taps Make a new version", "", "", "", "", "", "Building, then ready", "Your new version is ready (shipped)", "Same title"),
    ]
    th = "".join(f'<th scope="col" style="text-align: left; padding: 10px 12px; border-bottom: 1px solid {HLS}; font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 1.68px; text-transform: uppercase; color: {INK3}">{c}</th>' for c in cols)
    trs = ""
    for r in R:
        tds = f'<th scope="row" style="text-align: left; padding: 10px 12px; border-bottom: 1px solid {HL}; font-family: {DM}; font-weight: 700; font-size: 12px; color: {INK}">{r[0]}</th>'
        for c in r[1:]:
            tds += f'<td style="padding: 10px 12px; border-bottom: 1px solid {HL}; font-family: {INTER}; font-size: 12px; line-height: 16px; color: {INK if c else INK3}">{c or "n/a"}</td>'
        trs += f"<tr>{tds}</tr>"
    rules = "".join(f'<li style="margin: 0 0 6px 0">{body(t, 13, INK2)}</li>' for t in [
        "Source of truth: match detail Film status. Every other surface is a digest of it, using the same string for the same state.",
        "Only YOUR angle on the phone that recorded may be fresher than the server (local job). Everything else reads get_match_video_status.",
        "The number of angles in a phase line equals the rows drawn Ready and used.",
        "Nothing offers playback of an angle that isn&#39;t ready: Open match until one is, the hero has no play button, the switcher lists only ready angles.",
        "Countdown = wait_deadline_at minus server_now. Extended-wait copy only when the server says wait_extended.",
        "Red only for your own upload on the phone that recorded it, with Try again. Another person&#39;s angle: amber while it can arrive, grey once final.",
        "One push per athlete per match. Late angles never push. No live regions: announce phase and row changes only.",
    ])
    inner = (f'<div style="padding: 48px; display: flex; flex-direction: column; gap: 28px; flex-shrink: 0">'
             f'<div style="display: flex; flex-direction: column; gap: 8px"><h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 32px; color: {INK}">Match video status: where each state shows</h1>'
             f'{body("Copy per state: COPY-DECK.md v2 (jits-n2im.24). Server model: jr_be-1qz.20. Sample: M. Reyes vs D. Okafor, J. Cruz as timekeeper (record only).", 14, INK2)}</div>'
             f'<table style="width: 100%; border-collapse: collapse; background: {PLATE}; border: 1px solid {HL}; border-radius: 4px"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>'
             f'<div style="display: flex; flex-direction: column; gap: 10px"><h2 style="margin: 0; font-family: {MONO}; font-weight: 700; font-size: 11px; letter-spacing: 2.52px; text-transform: uppercase; color: {INK}">Rules every surface follows</h2>'
             f'<ul style="margin: 0; padding-left: 18px">{rules}</ul></div></div>')
    return inner


# ========== Board 01: Home with the upload strip ==========
def home_from_48(dock_html):
    src = open(os.path.join(SRC, "48-System-Overlays.dc.html")).read()
    m = re.search(r'<header .*?</nav>', src, re.S)
    core = m.group(0)
    return core.replace('<nav aria-label="Tabs"', dock_html + '<nav aria-label="Tabs"', 1)


@board("P-VS-01-Indicator-Home.dc.html", "Upload strip on Home, uploading", 390, 844)
def b01():
    return home_from_48(dock("uploading", 42))


# ========== Board 02: strip + compact line states ==========
@board("P-VS-02-Indicator-States.dc.html", "Upload strip and match flow line, all states")
def b02():
    s = sheet_title("Upload strip", "Above the tab bar on every tab, above the safe area on pushed screens. Never in the header. Hidden on countdown, live, and this match&#39;s verdict and detail. Tap opens the match.")
    for cap, st, kw in [("Preparing", "pending", {}), ("Uploading", "uploading", {"pct": 42}), ("Uploading, two matches", "uploading", {"pct": 61, "jobs": 2}),
                        ("Paused, retries on its own", "paused", {}), ("Failed, needs you", "failed", {}),
                        ("Failed again right after Try again", "failed", {"helper": "Still can&#39;t upload. Check your connection."}),
                        ("Failed, nothing to do (grey)", "terminal", {}), ("Uploaded (4 s, then hides)", "uploaded", {})]:
        s += caption(cap) + f'<div style="margin: 0 -16px">{dock(st, **kw)}</div>'
    s += f'<div style="height: 10px"></div>' + sheet_title("Match flow line", "One line under the End, Result and Confirm steps (the full status lives on the verdict).")
    for cap, st in [("Uploading", "uploading"), ("Paused", "paused"), ("Failed", "failed"), ("Failed, nothing to do", "terminal"), ("Uploaded", "uploaded")]:
        s += caption(cap) + compact_line(st)
    return sheet(s)


# ========== Verdict boards ==========
def verdict(film_html, watch=True):
    src = open(os.path.join(SRC, "29-Verdict.dc.html")).read()
    m = re.search(r'<!-- Full-bleed scroll content.*?<!-- Actions \(win\) -->', src, re.S)
    top = m.group(0)
    top = re.sub(r'<!-- UploadProgressBanner: uploaded -->.*?<!-- Actions \(win\) -->', film_html + '\n      <!-- Actions (win) -->', top, flags=re.S)
    # same match as the match detail boards (review nit 2)
    top = top.replace("1487 → 1504", "1469 → 1487").replace("▲ +17", "▲ +18").replace("by Rear Naked Choke · 03:48", "by Armbar · 04:12")
    m2 = re.search(r'<!-- Actions \(win\) -->(.*)</div>\n</x-dc>', src, re.S)
    rest = m2.group(1)
    if not watch:  # B1.3: no playable angle yet
        assert ">Watch film</span>" in rest
        rest = rest.replace(">Watch film</span>", ">Open match</span>")
        rest, k = re.subn(r'<svg[^>]*>(?:(?!</svg>).)*</svg>\s*(<span[^>]*>Open match</span>)', r'\1', rest, count=1, flags=re.S)
        assert k == 1
    return top + rest


@board("P-VS-03-Verdict-1-Angle.dc.html", "Verdict, one angle uploading (CTA Open match)")
def b03():
    fs = film_status("Uploading", "progress", "Your film is on its way.", "Your %TERM% starts as soon as it&#39;s in.",
                     [angle_row(ME, "Uploading", "progress", KEEP_OPEN, pct=42, last=True)], title="Film")
    return verdict(fs, watch=False)


@board("P-VS-04-Verdict-2-Angles.dc.html", "Verdict, two angles, waiting for the other")
def b04():
    fs = film_status("8:12 left", "waiting", "Waiting up to 10 min for D. Okafor&#39;s angle.", WAIT1_HELP,
                     [angle_row(ME, "Ready to watch", "done", right=watch_right("4:31"), href="33-Video-Player.dc.html"),
                      angle_row(OPP, "Uploading", "progress", pct=18, last=True)], title="Film", countdown_aria="8 minutes 12 seconds left")
    return verdict(fs)


@board("P-VS-05-Verdict-States.dc.html", "Verdict Film block, every state")
def b05():
    S = []
    S.append(("Mine paused, theirs waiting (CTA Open match)", film_status("Uploading", "progress", "Film is coming in from 2 phones.", "Your %TERM% uses every angle that arrives.", [
        angle_row(ME, "Paused", "waiting", NO_CONN, glyph="pause", action=try_again()),
        angle_row(OPP, "Waiting for their phone", "waiting", OPP_WAIT, last=True)], title="Film")))
    S.append(("Mine didn't upload, clip on this phone", film_status("Uploading", "progress", "Film is coming in from 2 phones.", "Your %TERM% uses every angle that arrives.", [
        angle_row(ME, "Didn't upload", "act", "The upload didn&#39;t finish.", action=try_again()),
        angle_row(OPP, "Uploading", "progress", pct=73, last=True)], title="Film")))
    S.append(("Extended wait (server says wait_extended)", film_status("6:40 left", "waiting", "D. Okafor&#39;s angle is in. Giving it up to 10 more min.", "It&#39;s being processed so your %TERM% can use it.", [
        angle_row(ME, "Ready to watch", "done", right=watch_right("4:31")),
        angle_row(OPP, "Processing", "waiting", last=True)], title="Film", countdown_aria="6 minutes 40 seconds left")))
    S.append(("Building from 2 angles", film_status("Building", "waiting", "Building your %TERM% from 2 angles.", USUAL, [
        angle_row(ME, "Ready to watch", "done", right=watch_right("4:31")),
        angle_row(OPP, "Ready to watch", "done", right=watch_right("4:26"), last=True)], title="Film")))
    S.append(("Wait ended, theirs still paused", film_status("Building", "waiting", "Building your %TERM% from your angle.", "If D. Okafor&#39;s angle arrives in the next 24 hours, we&#39;ll add it.", [
        angle_row(ME, "Ready to watch", "done", right=watch_right("4:31")),
        angle_row(OPP, "Paused", "waiting", None, glyph="pause", last=True)], title="Film")))
    S.append(("Their angle didn't upload", film_status("Ready", "done", "Film and %TERM% ready.", None, [
        angle_row(ME, "Ready to watch", "done", right=watch_right("4:31")),
        angle_row(OPP, "Didn't upload", "info", "Your %TERM% uses your angle.", last=True)], title="Film")))
    S.append(("No video yet (first 15 min, nobody known)", no_rows(film_status("No video yet", "info", "No video yet.", "If someone recorded, it will show up here.", [], title="Film"))))
    S.append(("Nobody recorded (after the grace window)", no_rows(film_status("No film", "info", "No film for this match.", "No one recorded it. Turn on Record from my phone at the face-off next time.", [], title="Film"))))
    s = sheet_title("Verdict: Film block", "Replaces the upload banner and the highlight note. Same component and strings as match detail. The red CTA reads Open match until an angle is ready, then Watch film.")
    for cap, html in S:
        s += caption(cap) + html
    return sheet(s)


# ========== Match detail ==========
def md_shell(film_html, playable=True, switch=False, dur=None):
    src = open(os.path.join(SRC, "32-Match-Detail.dc.html")).read()
    m = re.search(r'<div style="display: flex; flex-direction: column; flex-shrink: 0">.*?<!-- AngleSwitcher', src, re.S)
    head = m.group(0)[: -len("<!-- AngleSwitcher")]
    if not playable:  # B1.3: no play button or duration until the selected angle is ready
        head, n1 = re.subn(r'<a href="33-Video-Player.dc.html" aria-label="Play match film".*?</a>\s*', "", head, flags=re.S)
        head, n2 = re.subn(r'<div style="position: absolute; right: 16px; bottom: 16px;[^>]*>06:00</div>', "", head)
        head, n3 = re.subn(r'>OPENING STILL</div>', ">STILL ARRIVES AFTER UPLOAD</div>", head)
        assert n1 == 1 and n2 == 1 and n3 == 1, (n1, n2, n3)
        head, n4 = re.subn(r'>POSTER \(SLICER OPENING STILL\)</div>', ">NO STILL YET</div>", head)
        assert n4 == 1
    if playable and dur:
        head, n5 = re.subn(r'(<div style="position: absolute; right: 16px; bottom: 16px;[^>]*>)06:00</div>', r'\g<1>' + dur + '</div>', head)
        assert n5 == 1
    sw = ""
    if switch:
        m2 = re.search(r'<!-- AngleSwitcher.*?<!-- AiBreakdown', src, re.S)
        sw = m2.group(0)[: -len("<!-- AiBreakdown")]
    ai = (f'<section aria-label="AI breakdown" style="background: {PLATE}; border: 1px solid {HL}; border-radius: 3px; padding: 14px; display: flex; flex-direction: column; gap: 10px">'
          f'<h2 style="margin: 0; font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 2.52px; color: {INK}">AI BREAKDOWN</h2>'
          f'{body("The breakdown appears once the film is processed.", 13, INK2)}</section>')
    return head + "<!-- FilmStatus (proposed, source of truth) -->\n    " + film_html + "\n    " + sw + ai + "\n  </div>\n</div>"


@board("P-VS-06-Match-Detail.dc.html", "Match detail, three angles, waiting for 2 more")
def b06():
    fs = film_status("8:12 left", "waiting", "Waiting up to 10 min for 2 more angles.", WAITN_HELP,
                     [angle_row(ME, "Ready to watch", "done", right=watch_right("4:31"), href="33-Video-Player.dc.html"),
                      angle_row(OPP, "Uploading", "progress", pct=64),
                      angle_row(TK, "Paused", "waiting", TK_QUIET, glyph="pause", tk=True, last=True)],
                     countdown_aria="8 minutes 12 seconds left")
    return md_shell(fs, playable=True, switch=False, dur="04:31")


@board("P-VS-07-Match-Detail.dc.html", "Match detail, my upload paused (retry), nothing playable")
def b07():
    fs = film_status("Uploading", "progress", "Film is coming in from 2 phones.", "Your %TERM% uses every angle that arrives.",
                     [angle_row(ME, "Paused", "waiting", NO_CONN, glyph="pause", action=try_again()),
                      angle_row(OPP, "Processing", "waiting", last=True)])
    return md_shell(fs, playable=False, switch=False)


@board("P-VS-08-Film-Status-Phases.dc.html", "Film status, every match phase (competitor and timekeeper)")
def b08():
    R_ME = lambda **k: angle_row(ME, "Ready to watch", "done", right=watch_right("4:31"), **k)
    R_OPP = lambda **k: angle_row(OPP, "Ready to watch", "done", right=watch_right("4:26"), **k)
    P = [
        ("No video yet (grace window)", no_rows(film_status("No video yet", "info", "No video yet.", "If someone recorded, it will show up here.", []))),
        ("Collecting, 1 angle", film_status("Uploading", "progress", "Your film is on its way.", "Your %TERM% starts as soon as it&#39;s in.", [angle_row(ME, "Uploading", "progress", KEEP_OPEN, pct=42, last=True)])),
        ("Collecting, nothing in after 15 min (film window open)", film_status("Uploading", "progress", "Film is coming in from 2 phones.", "If nothing arrives by tomorrow 9:12 PM, we&#39;ll let you know there&#39;s no film.", [angle_row(ME, "Waiting for your phone", "waiting", "Open ELO RATED on the phone that recorded to start the upload."), angle_row(OPP, "Waiting for their phone", "waiting", OPP_WAIT, last=True)])),
        ("Collecting, 2 angles", film_status("Uploading", "progress", "Film is coming in from 2 phones.", "Your %TERM% uses every angle that arrives.", [angle_row(ME, "Processing", "waiting"), angle_row(OPP, "Uploading", "progress", pct=18, last=True)])),
        ("Waiting for one angle", film_status("8:12 left", "waiting", "Waiting up to 10 min for D. Okafor&#39;s angle.", WAIT1_HELP, [R_ME(), angle_row(OPP, "Waiting for their phone", "waiting", OPP_WAIT, last=True)], countdown_aria="8 minutes 12 seconds left")),
        ("Deadline passed, server not moved yet", film_status("Any second now", "waiting", "Waiting up to 10 min for D. Okafor&#39;s angle.", WAIT1_HELP, [R_ME(), angle_row(OPP, "Waiting for their phone", "waiting", OPP_WAIT, last=True)])),
        ("Building, 3 angles", film_status("Building", "waiting", "Building your %TERM% from 3 angles.", USUAL, [R_ME(), R_OPP(), angle_row(TK, "Ready to watch", "done", right=watch_right("4:40"), tk=True, last=True)])),
        ("Ready", film_status("Ready", "done", "Film and %TERM% ready.", None, [R_ME(), R_OPP(last=True)])),
        ("Ready, their angle still processing after dispatch", film_status("Ready", "done", "Film and %TERM% ready.", None, [R_ME(), angle_row(OPP, "Processing", "waiting", "If it&#39;s in by 9:42 PM, we&#39;ll add it to your %TERM%.", last=True)])),
        ("Ready, late angle added (no push)", film_status("Ready", "done", "Film and %TERM% ready.", "D. Okafor&#39;s angle came in later. Your %TERM% was updated with it.", [R_ME(), R_OPP(last=True)])),
        ("Ready, late angle after you shared (no push)", film_status("Ready", "done", "Film and %TERM% ready.", "D. Okafor&#39;s angle came in after you shared your %TERM%. You can make a new version.", [R_ME(), R_OPP(last=True)])),
        ("Ready, late window closed", film_status("Ready", "done", "Film and %TERM% ready.", None, [R_ME(), angle_row(OPP, "Not in your %TERM%", "info", "It will still be watchable if it uploads.", last=True)])),
        ("Film only: no %TERM% possible", film_status("Film ready", "done", "Film ready to watch.", "We couldn&#39;t find a clear %TERM% of you in this video.", [R_ME(last=True)])),
        ("Film only: %TERM% failed", film_status("Film ready", "done", "Film ready to watch.", "We couldn&#39;t make your %TERM%. Try again on the card below.", [R_ME(last=True)])),
        ("Their angle not used", film_status("Ready", "done", "Film and %TERM% ready.", None, [R_ME(), angle_row(OPP, "Not used", "info", "No match was found in this clip.", last=True)])),
        ("Mine couldn't be processed", film_status("Ready", "done", "Film and %TERM% ready.", None, [angle_row(ME, "Not used", "info", "Your %TERM% uses D. Okafor&#39;s angle."), R_OPP(last=True)])),
        ("No film: none usable", film_status("No film", "info", "No film for this match.", "None of the video could be used. Your result and rating aren&#39;t affected.", [angle_row(ME, "Didn't upload", "info", "The clip isn&#39;t on this phone anymore."), angle_row(OPP, "Not used", "info", "This clip couldn&#39;t be processed.", last=True)])),
        ("No film: film window closed, nothing came in", film_status("No film", "info", "No film for this match.", "None of the video came in. Your result and rating aren&#39;t affected.", [angle_row(ME, "Didn't upload", "info", "The upload didn&#39;t finish on the phone that recorded."), angle_row(OPP, "Didn't upload", "info", last=True)])),
        ("Timekeeper view: building", film_status("Building", "waiting", "Building the players&#39; %TERM%s from 2 angles.", None, [angle_row(ME, "Ready to watch", "done", right=watch_right("4:40")), angle_row("M. Reyes's angle", "Ready to watch", "done", right=watch_right("4:31")), angle_row("D. Okafor's angle", "Processing", "waiting", "It can still be added until 9:42 PM.", last=True)])),
        ("Timekeeper view: ready", film_status("Ready", "done", "Film ready. Thanks for recording.", None, [angle_row(ME, "Ready to watch", "done", right=watch_right("4:40")), angle_row("M. Reyes's angle", "Ready to watch", "done", right=watch_right("4:31")), angle_row("D. Okafor's angle", "Ready to watch", "done", right=watch_right("4:26"), last=True)])),
    ]
    s = sheet_title("Film status: phases", "The match detail plate, under the result. Viewer M. Reyes unless marked timekeeper. 9:42 PM is late_angle_until (24 h after the build started).")
    for cap, html in P:
        s += caption(cap) + html
    return sheet(s)


@board("P-VS-09-Angle-Rows.dc.html", "Film status rows, every angle state x viewer")
def b09():
    G = [
        ("Your angle, on the phone that recorded it", [
            angle_row(ME, "Not uploaded", "waiting", "The upload hasn&#39;t started yet.", action=btn_secondary("Upload now", 44, "Upload now: your angle")),
            angle_row(ME, "Not uploaded", "info", "The clip isn&#39;t on this phone anymore."),
            angle_row(ME, "Uploading", "progress", KEEP_OPEN, pct=42),
            angle_row(ME, "Paused", "waiting", NO_CONN, glyph="pause", action=try_again()),
            angle_row(ME, "Didn't upload", "act", "The upload didn&#39;t finish.", action=try_again()),
            angle_row(ME, "Didn't upload", "info", "The clip isn&#39;t on this phone anymore."),
            angle_row(ME, "Processing", "waiting"),
            angle_row(ME, "Ready to watch", "done", right=watch_right("4:31")),
            angle_row(ME, "Not used", "info", "We couldn&#39;t see a match in this clip."),
            angle_row(ME, "Not used", "info", "Your %TERM% uses D. Okafor&#39;s angle.", last=True)]),
        ("Your angle, on another device (no Try again)", [
            angle_row(ME, "Waiting for your phone", "waiting", "Open ELO RATED on the phone that recorded to start the upload."),
            angle_row(ME, "Uploading", "progress", pct=42),
            angle_row(ME, "Paused", "waiting", "Open ELO RATED on the phone that recorded to finish the upload.", glyph="pause"),
            angle_row(ME, "Didn't upload", "info", "The upload didn&#39;t finish on the phone that recorded.", last=True)]),
        ("Another competitor's angle", [
            angle_row(OPP, "Waiting for their phone", "waiting", OPP_WAIT),
            angle_row(OPP, "Uploading", "progress", pct=18),
            angle_row(OPP, "Paused", "waiting", OPP_QUIET, glyph="pause"),
            angle_row(OPP, "Processing", "waiting"),
            angle_row(OPP, "Ready to watch", "done", right=watch_right("4:26")),
            angle_row(OPP, "Not used", "info", "No match was found in this clip."),
            angle_row(OPP, "Not used", "info", "This clip couldn&#39;t be processed."),
            angle_row(OPP, "Didn't upload", "info", "Your %TERM% uses your angle.", last=True)]),
        ("Another competitor's angle, after your %TERM% was built", [
            angle_row(OPP, "Waiting for their phone", "waiting", UNTIL),
            angle_row(OPP, "Paused", "waiting", UNTIL, glyph="pause"),
            angle_row(OPP, "Processing", "waiting", "If it&#39;s in by 9:42 PM, we&#39;ll add it to your %TERM%."),
            angle_row(OPP, "Not in your %TERM%", "info", "It will still be watchable if it uploads.", last=True)]),
        ("Timekeeper&#39;s angle", [
            angle_row(TK, "Waiting for their phone", "waiting", "It uploads when ELO RATED is open on J. Cruz&#39;s phone.", tk=True),
            angle_row(TK, "Uploading", "progress", pct=55, tk=True),
            angle_row(TK, "Paused", "waiting", TK_QUIET, glyph="pause", tk=True),
            angle_row(TK, "Ready to watch", "done", right=watch_right("4:40"), tk=True),
            angle_row(TK, "Didn't upload", "info", "Your %TERM% uses the other angles.", tk=True, last=True)]),
    ]
    s = sheet_title("Angle rows", "Every angle state for each viewer relation. Red only for your own upload on the phone that recorded it, when you can try again.")
    for cap, rows in G:
        s += caption(cap) + f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 0 14px">{"".join(rows)}</div>'
    return sheet(s)


# ========== Film Room ==========
def poster(opp, letter, line, date, badge=None, badge_col=INK, badge_border="rgba(255,255,255,0.40)", still=True, overlay=None, pct=None, aria=None, retry=False):
    lcol = {"W": GREEN, "L": "#F0556B", "D": INK}[letter]
    lborder = {"W": GREEN, "L": "rgba(240,85,107,0.7)", "D": "rgba(255,255,255,0.40)"}[letter]
    bg = (f'<div style="position: absolute; inset: 0; background: {BRIGHT}; display: flex; align-items: flex-start; justify-content: center; padding-top: 72px; box-sizing: border-box; '
          f'font-family: {MONO}; font-weight: 500; font-size: 10px; letter-spacing: 2px; color: rgba(232,237,242,0.35)">OPENING STILL</div>'
          f'<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 58%; background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.88))"></div>') if still else (
        f'<div style="position: absolute; inset: 0; background: {PLATE}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding-bottom: 40px; box-sizing: border-box">'
        f'<div style="display: flex; flex-direction: row; gap: 8px">'
        + "".join(f'<div aria-hidden="true" style="width: 40px; height: 40px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; display: flex; align-items: center; justify-content: center; font-family: {DM}; font-weight: 700; font-size: 13px; letter-spacing: 1.12px; color: {INK}">{i}</div>' for i in ("MR", "".join(w[0] for w in opp.replace(".", "").split())))
        + f'</div>{mono(overlay or "", 10, INK2, 700, 1.68)}'
        + (f'<div style="width: 60%">{track(pct)}</div>' if pct is not None else "")
        + '</div>')
    badges = ""
    if badge:
        badges = (f'<div style="position: absolute; top: 8px; right: 8px; left: 8px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px">'
                  f'<div style="height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; display: flex; align-items: center; background: rgba(0,0,0,0.88); border: 1px solid {badge_border}; '
                  f'font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; font-variant-numeric: tabular-nums; text-transform: uppercase; color: {badge_col}; white-space: nowrap">{badge}</div></div>')
    namecol = "#FFFFFF" if still else INK
    bottom = (f'<div style="position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 6px">'
              f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px; min-width: 0">'
              f'<div style="height: 20px; min-width: 20px; box-sizing: border-box; padding: 0 5px; border-radius: 2px; border: 1px solid {lborder}; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; font-family: {MONO}; font-weight: 700; font-size: 11px; color: {lcol}">{letter}</div>'
              f'<div style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: {DM}; font-weight: 700; font-size: 13px; line-height: 17px; letter-spacing: 0.56px; text-transform: uppercase; color: {namecol}">{opp}</div></div>'
              f'<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 6px">'
              f'<div style="white-space: nowrap; overflow: hidden; font-family: {MONO}; font-weight: 700; font-size: 11px; line-height: 14px; letter-spacing: 0.56px; color: {lcol}; font-variant-numeric: tabular-nums">{line}</div>'
              f'<div style="white-space: nowrap; font-family: {MONO}; font-weight: 500; font-size: 10px; line-height: 13px; letter-spacing: 1.12px; color: rgba(232,237,242,0.72); font-variant-numeric: tabular-nums">{date}</div></div></div>')
    a = (f'<a href="P-VS-07-Match-Detail.dc.html" aria-label="{aria or opp}" style="position: absolute; inset: 0; overflow: hidden; border-radius: 3px; border: 1px solid {HL}; background: {PLATE}; display: block; color: inherit">'
         f'{bg}{badges}{bottom if not retry else bottom.replace("bottom: 10px", "bottom: 62px")}</a>')
    if retry:
        a += (f'<div style="position: absolute; left: 10px; right: 10px; bottom: 10px">'
              + btn_secondary("Try again", 44, f"Try again: upload match video vs {opp}", "width: 100%") + '</div>')
    return f'<div style="flex: 1; min-width: 0; aspect-ratio: 3 / 4; position: relative">{a}</div>'


@board("P-VS-10-Film-Room.dc.html", "Film Room card states", 390, 1000)
def b10():
    src = open(os.path.join(SRC, "31-Film-Room.dc.html")).read()
    m = re.search(r'<!-- Header: back \+ FILM ROOM -->.*?<!-- Month header -->', src, re.S)
    head = m.group(0)[: -len("<!-- Month header -->")]
    month = (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10px; margin-top: 22px; margin-bottom: 12px">'
             f'<h2 style="margin: 0; font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 2.52px; color: {INK2}">OCTOBER 2026</h2>'
             f'<div style="flex: 1; height: 1px; background: {HL}"></div>{mono("6 matches", 10, INK3, 500, 1.68)}</div>')
    A = "rgba(245,158,11,0.7)"
    row = lambda a, b: f'<div style="display: flex; flex-direction: row; gap: 16px; margin-bottom: 16px">{a}{b}</div>'
    r1 = row(poster("D. Okafor", "W", "▲ +18 · 04:12", "OCT 4", still=False, overlay="Uploading 42%", pct=42, aria="Won vs D. Okafor, OCT 4, uploading 42 percent"),
             poster("L. Tanaka", "L", "▼ −11 · 06:00", "OCT 4", badge="UPLOAD PAUSED", badge_col=AMBER, badge_border=A, still=False, overlay="Still arrives after upload", aria="Lost vs L. Tanaka, OCT 4, upload paused"))
    r2 = row(poster("P. Shah", "W", "▲ +9 · 05:10", "OCT 3", badge="DIDN&#39;T UPLOAD", badge_col=NEG, badge_border="rgba(236,106,116,0.7)", still=False, retry=True, aria="Won vs P. Shah, OCT 3, your video didn&#39;t upload"),
             poster("S. Whitfield", "L", "▼ −9 · 05:31", "OCT 3", badge="WAITING 8:12", badge_col=AMBER, badge_border=A, aria="Lost vs S. Whitfield, OCT 3, waiting for another angle, 8 minutes 12 seconds left"))
    r3 = row(poster("J. Cruz", "D", "▼ −4 · 06:00", "OCT 2", badge="BUILDING %TERM%", badge_col=AMBER, badge_border=A, aria="Draw vs J. Cruz, OCT 2, building %TERM%"),
             poster("D. Okafor", "W", "▲ +14 · 03:05", "OCT 1", badge="NO FILM", badge_col=INK3, badge_border=HLS, still=False, aria="Won vs D. Okafor, OCT 1, no film"))
    return f'<div style="display: flex; flex-direction: column; flex-shrink: 0; padding: 55px 16px 0 16px">{head}{month}{r1}{r2}{r3}</div>'


# ========== Push + bell ==========
def push_card(title, text, when="now"):
    return (f'<div style="background: rgba(30,34,43,0.94); border: 1px solid {HL}; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: row; gap: 10px; align-items: flex-start">'
            f'<div aria-hidden="true" style="width: 32px; height: 32px; border-radius: 6px; background: {VOID}; border: 1px solid {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: 11px; color: {INK}">E<span style="display: inline-block; width: 3px; height: 3px; background: {RED}; margin: 0 1px"></span>R</div>'
            f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
            f'<div style="display: flex; flex-direction: row; justify-content: space-between; gap: 8px">{mono("ELO RATED", 10, INK2, 700, 1.12)}{mono(when, 10, INK3, 500, 0.56, False)}</div>'
            f'{heading(title, 14, INK, 0, False)}{body(text, 13, INK2)}</div></div>')


def bell_row(title, text, when, icon="clapper", unread=True):
    dot = f'<span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 4px; background: {INK}"></span>' if unread else ""
    return (f'<a href="P-VS-06-Match-Detail.dc.html" style="display: flex; flex-direction: row; align-items: flex-start; gap: 10.5px; padding: 10.5px; border-radius: 2px; color: {INK}">'
            f'<span style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 2px; border: 1px solid {HL}; background: {PLATE}; flex-shrink: 0">{ic(icon, 14, INK3)}</span>'
            f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3.5px">{heading(title, 13, INK, 0, False)}{body(text, 12, INK2)}</span>'
            f'<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px; padding-top: 2px">{mono(when, 10, INK3, 400, 1.68)}{dot}</span></a>')


@board("P-VS-11-Push-Bell.dc.html", "Push and bell, one per athlete per match")
def b11():
    s = sheet_title("Push", "Push and bell bodies say %NTERM%, the in-app screens say %TERM% (both shipped). One push per athlete per match: film ready and %NTERM% ready are folded. A late angle (origin late_angle), a second angle or an abandoned upload never pushes. Only a version the athlete asked for adds one.")
    for cap, t, b_ in [
        ("Competitor, %TERM% ready (the one push)", "Your highlight is ready", "Your %NTERM% vs D. Okafor is ready. Tap to watch."),
        ("Competitor, film only (no %TERM% possible)", "Your match film is ready", "Film from your match vs D. Okafor is ready to watch."),
        ("Competitor, no usable film (replaces the %NTERM% push)", "No film for your match", "The video from your match vs D. Okafor couldn&#39;t be used. Your result stands."),
        ("Timekeeper, at phase ready", "Match film is ready", "M. Reyes vs D. Okafor. Tap to watch the film."),
        ("Competitor tapped Make a new version (shipped regen push, kept)", "Your new version is ready", "Version 2 of your %NTERM% vs D. Okafor is ready."),
        ("Device-local notification (not a push): app closed mid-upload", "Your match film isn&#39;t uploaded yet", "Open ELO RATED to finish uploading it."),
    ]:
        s += caption(cap) + push_card(t, b_)
    s += '<div style="height: 10px"></div>' + sheet_title("Bell", "Same title as the push, shorter body.")
    rows = (bell_row("Your highlight is ready", "Your %NTERM% vs D. Okafor is ready to watch.", "2m")
            + bell_row("Your match film is ready", "Film vs S. Whitfield is ready to watch.", "1d", unread=False)
            + bell_row("No film for your match", "The video from your match vs L. Tanaka couldn&#39;t be used.", "2d", unread=False))
    s += f'<div style="background: {PANEL}; border: 1px solid {HL}; border-radius: 8px; padding: 7px">{rows}</div>'
    return sheet(s)


# ========== Timekeeper ==========
def rec_panel(extra):
    return (f'<div style="display: flex; flex-direction: column; gap: 10px">'
            f'<div style="min-height: 56px; box-sizing: border-box; padding: 0 14px; display: flex; flex-direction: row; align-items: center; gap: 12px; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'<div style="flex: 1; display: flex; flex-direction: column; gap: 4px">{heading("Record from my phone", 13, INK, 1.12)}{mono("D. Okafor is recording too", 10, INK, 500, 1.68)}</div>'
            f'<label style="display: none">'
            f'</label><button type="button" role="switch" aria-checked="true" aria-label="Record from my phone" style="width: 50px; height: 30px; box-sizing: border-box; padding: 3px; border: 1px solid {HLS}; border-radius: 15px; background: {BRIGHT}; display: flex; justify-content: flex-end; cursor: pointer"><span aria-hidden="true" style="width: 22px; height: 22px; border-radius: 11px; background: {INK}"></span></button></div>{extra}</div>')


def faceoff_top(sub="FACE-OFF · READY"):
    return (f'<div style="height: 44px; display: flex; flex-direction: row; align-items: center; justify-content: space-between">'
            f'<a href="13-Arena-Live.dc.html" style="height: 44px; display: flex; align-items: center; color: {INK}">{heading("Leave", 13, INK, 1.12)}</a>'
            f'{mono(sub, 10, INK3, 700, 2.52)}<span style="width: 50px"></span></div>'
            f'<div style="display: flex; flex-direction: row; align-items: center; gap: 12px">'
            + "".join(f'<div style="flex: 1; display: flex; flex-direction: column; gap: 8px; align-items: {al}"><div aria-hidden="true" style="width: 100%; height: 120px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {PLATE}; border: 1px solid {HLS}; border-radius: 2px{bb}"><span style="font-family: {BEBAS}; font-size: 52px; color: {INK}">{ini}</span></div>{heading(n, 15, INK, 0.56)}</div>'
                      for ini, n, al, bb in [("MR", "M. Reyes", "flex-start", f"; border-bottom: 3px solid {RED}"), ("DO", "D. Okafor", "flex-end", "")])
            .replace('</div><div style="flex: 1', f'</div><span style="font-family: {BEBAS}; font-size: 30px; color: {NEG}">VS</span><div style="flex: 1', 1)
            + '</div>')


def tk_row(state):
    if state == "none":
        right = (f'<a href="P-VS-13-Timekeeper-Sheet.dc.html" style="min-height: 44px; box-sizing: border-box; padding: 0 12px; border: 1px solid {HLS}; border-radius: 3px; background: {BRIGHT}; display: flex; align-items: center; gap: 6px; '
                 f'font-family: {DM}; font-weight: 700; font-size: 12px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}">{ic("userplus", 14, INK)}Add</a>')
        sub = body("Add someone to film from the sideline. They only record.", 12, INK2)
    else:
        right = ""
        sub = mono("J. Cruz is recording", 10, INK, 500, 1.68)
    return (f'<div style="min-height: 56px; box-sizing: border-box; padding: 10px 14px; display: flex; flex-direction: row; align-items: center; gap: 12px; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'{ic("video", 18, INK2)}<div style="flex: 1; display: flex; flex-direction: column; gap: 4px">{heading("Timekeeper", 13, INK, 1.12)}{sub}</div>{right}</div>')


def ready_cta():
    return (f'<a href="23-Countdown.dc.html" style="height: 72px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {RED}; border-radius: 3px; '
            f'font-family: {DM}; font-weight: 700; font-size: 16px; letter-spacing: 1.12px; text-transform: uppercase; color: {VOID}">I&#39;m ready</a>')


def big_btn(label, href, primary=False):
    bg = f"background: {RED}; color: {VOID}" if primary else f"background: {PLATE}; border: 1px solid {HLS}; color: {INK}"
    return (f'<a href="{href}" style="height: 52px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 3px; {bg}; '
            f'font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase">{label}</a>')


@board("P-VS-12-Faceoff-Timekeeper.dc.html", "Face-off, add a timekeeper", 390, 844)
def b12():
    return (f'<div style="padding: 55px 16px 34px 16px; display: flex; flex-direction: column; gap: 18px; flex: 1">{faceoff_top()}'
            f'{rec_panel(tk_row("none"))}<div style="flex: 1"></div>{ready_cta()}</div>')


@board("P-VS-13-Timekeeper-Sheet.dc.html", "Face-off, timekeeper QR and code sheet", 390, 844)
def b13():
    under = (f'<div aria-hidden="true" style="position: absolute; inset: 0; padding: 55px 16px 0 16px; display: flex; flex-direction: column; gap: 18px; opacity: 0.35">{faceoff_top()}</div>'
             f'<div aria-hidden="true" style="position: absolute; inset: 0; background: rgba(0,0,0,0.55)"></div>')
    qr = "".join(
        f'<rect x="{x * 8}" y="{y * 8}" width="8" height="8"></rect>'
        for y in range(25) for x in range(25)
        if ((x < 7 and y < 7) or (x > 17 and y < 7) or (x < 7 and y > 17)) and (x in (0, 6, 18, 24) or y in (0, 6, 18, 24) or (2 <= x % 18 <= 4 and 2 <= y % 18 <= 4))
        or (not ((x < 8 and y < 8) or (x > 16 and y < 8) or (x < 8 and y > 16)) and (x * 7 + y * 13 + x * y) % 5 < 2))
    sheet_html = (f'<div role="dialog" aria-label="Add a timekeeper" style="position: absolute; left: 0; right: 0; bottom: 0; background: {PANEL}; border-top: 1px solid {HLS}; border-radius: 8px 8px 0 0; '
                  f'padding: 10px 16px 34px 16px; display: flex; flex-direction: column; gap: 14px">'
                  f'<div aria-hidden="true" style="align-self: center; width: 36px; height: 4px; border-radius: 2px; background: {HLS}"></div>'
                  f'<h2 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 18px; color: {INK}">Add a timekeeper</h2>'
                  f'{body("Have them scan this with ELO RATED, or enter the code. A timekeeper only records the match from the sideline. They don&#39;t run the clock, and their rating isn&#39;t affected.", 13, INK2)}'
                  f'<div style="align-self: center; width: 216px; height: 216px; box-sizing: border-box; padding: 8px; background: {INK}; border-radius: 4px">'
                  f'<svg role="img" aria-label="Timekeeper QR code" width="200" height="200" viewBox="0 0 200 200" fill="{VOID}" style="display: block">{qr}</svg></div>'
                  f'<div style="display: flex; flex-direction: column; align-items: center; gap: 4px">{mono("Code", 10, INK3, 500, 2.52)}'
                  f'<span style="font-family: {MONO}; font-weight: 700; font-size: 28px; letter-spacing: 6px; font-variant-numeric: tabular-nums; color: {INK}">K7Q 4XM</span></div>'
                  f'<div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px">{ic("loader", 14, AMBER)}{mono("Waiting for a timekeeper to join", 10, AMBER, 700, 1.68)}</div>'
                  f'{big_btn("Done", "P-VS-12-Faceoff-Timekeeper.dc.html")}</div>')
    return under + sheet_html


@board("P-VS-14-Timekeeper-Join.dc.html", "Timekeeper, join by QR or code", 390, 844)
def b14():
    view = (f'<div style="position: relative; height: 280px; border-radius: 4px; overflow: hidden; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">'
            f'{mono("Camera", 10, "rgba(232,237,242,0.35)", 500, 2)}'
            f'<div aria-hidden="true" style="position: absolute; left: 70px; right: 70px; top: 46px; bottom: 46px; border: 2px solid rgba(255,255,255,0.85); border-radius: 4px"></div>'
            f'<div style="position: absolute; left: 0; right: 0; bottom: 12px; display: flex; justify-content: center"><span style="padding: 4px 8px; border-radius: 2px; background: rgba(0,0,0,0.88)">{mono("Point at the code on a player&#39;s phone", 10, INK, 500, 1.12)}</span></div></div>')
    field = (f'<div style="display: flex; flex-direction: column; gap: 6px"><label for="tk-code" style="font-family: {MONO}; font-weight: 500; font-size: 10px; letter-spacing: 2.52px; text-transform: uppercase; color: {INK3}">Code</label>'
             f'<input id="tk-code" value="K7Q 4XM" style="height: 48px; box-sizing: border-box; padding: 0 14px; background: {PLATE}; border: 1px solid {INK2}; border-radius: 3px; font-family: {MONO}; font-weight: 700; font-size: 18px; letter-spacing: 4px; color: {INK}"></div>')
    err = f'<p style="margin: 0">{body("That code didn&#39;t work. Check it and try again.", 12, NEG)}</p>'
    return (app_header("Join as timekeeper", "12-Arena-Offline.dc.html")
            + f'<div style="padding: 20px 16px 34px; display: flex; flex-direction: column; gap: 16px; flex: 1">{body("Scan the code on a player&#39;s phone, or enter it. As timekeeper you only record the match.", 14, INK2)}{view}{field}'
            + f'<div style="display: flex; flex-direction: column; gap: 6px">{caption("Error state (example)")}{err}</div><div style="flex: 1"></div>{big_btn("Join as timekeeper", "P-VS-15-Timekeeper-Joined.dc.html", True)}</div>')


@board("P-VS-15-Timekeeper-Joined.dc.html", "Timekeeper joined, record only", 390, 844)
def b15():
    names = (f'<div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 14px">{heading("M. Reyes", 16, INK, 0.56)}'
             f'<span style="font-family: {BEBAS}; font-size: 26px; color: {NEG}">VS</span>{heading("D. Okafor", 16, INK, 0.56)}</div>')
    tips = "".join(f'<li style="display: flex; flex-direction: row; gap: 10px; align-items: flex-start">{ic(i, 16, INK2)}{body(t, 13, INK)}</li>' for i, t in [
        ("video", "Prop the phone up with both players in frame."),
        ("timer", "Recording starts when the match starts and stops at the final whistle."),
        ("upload", "After the match, keep ELO RATED open until your film uploads.")])
    return (f'<div style="padding: 55px 16px 34px; display: flex; flex-direction: column; gap: 20px; flex: 1">'
            f'<div style="height: 44px; display: flex; flex-direction: row; align-items: center; justify-content: space-between"><a href="Main.dc.html" style="height: 44px; display: flex; align-items: center">{heading("Leave", 13, INK, 1.12)}</a>{tag("Record only", INK2, HLS)}</div>'
            f'<h1 style="margin: 0; font-family: {BEBAS}; font-weight: 400; font-size: 52px; line-height: 52px; color: {INK}">YOU&#39;RE THE TIMEKEEPER</h1>{names}'
            f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px"><ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px">{tips}</ul></div>'
            f'{body("Timekeepers only record. You don&#39;t run the clock, and your rating isn&#39;t affected. You&#39;ll see the film and every angle when it&#39;s ready.", 12, INK2)}'
            f'<div style="flex: 1"></div><div style="height: 56px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'{ic("loader", 14, AMBER)}{mono("Waiting for the players to start", 10, AMBER, 700, 1.68)}</div></div>')


@board("P-VS-16-Timekeeper-Recording.dc.html", "Timekeeper recording (record only, no clock control)", 390, 844)
def b16():
    return (f'<div style="position: absolute; inset: 0; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">{mono("Camera", 10, "rgba(232,237,242,0.35)", 500, 2)}</div>'
            f'<div style="position: absolute; left: 0; right: 0; top: 0; height: 160px; background: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0))"></div>'
            f'<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 220px; background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.85))"></div>'
            f'<div style="position: absolute; left: 16px; right: 16px; top: 55px; display: flex; flex-direction: row; align-items: center; justify-content: space-between">'
            f'<a href="P-VS-19-Timekeeper-States.dc.html" style="height: 44px; display: flex; align-items: center; padding: 0 4px; color: #FFFFFF">{heading("Leave", 13, "#FFFFFF", 1.12)}</a>'
            f'<span style="height: 28px; box-sizing: border-box; padding: 0 9px; display: flex; align-items: center; gap: 7px; background: rgba(0,0,0,0.88); border-radius: 2px">'
            f'<span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 4px; background: #FFFFFF"></span>{mono("Recording", 10, "#FFFFFF", 700, 1.68)}</span>'
            f'<span aria-label="Match clock 3 minutes 48 seconds" style="height: 28px; box-sizing: border-box; padding: 0 9px; display: flex; align-items: center; background: rgba(0,0,0,0.88); border-radius: 2px; font-family: {MONO}; font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; color: #FFFFFF">03:48</span></div>'
            f'<div style="position: absolute; left: 16px; right: 16px; bottom: 42px; display: flex; flex-direction: column; gap: 6px">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 16px; letter-spacing: 0.56px; text-transform: uppercase; color: #FFFFFF">Timekeeper: recording M. Reyes vs D. Okafor</span>'
            f'<span style="font-family: {INTER}; font-size: 13px; line-height: 17px; color: rgba(232,237,242,0.85)">You only record. The players run the clock. Recording stops at the final whistle.</span></div>')


@board("P-VS-17-Timekeeper-After.dc.html", "Timekeeper after the match, upload status")
def b17():
    fs = film_status("Uploading", "progress", "Film is coming in.", KEEP_OPEN,
                     [angle_row(ME, "Uploading", "progress", pct=37),
                      angle_row("M. Reyes's angle", "Processing", "waiting"),
                      angle_row("D. Okafor's angle", "Uploading", "progress", pct=22, last=True)])
    inner = (f'<div style="padding: 55px 16px 34px; display: flex; flex-direction: column; gap: 18px; flex-shrink: 0">'
             f'<h1 style="margin: 0; font-family: {BEBAS}; font-weight: 400; font-size: 72px; line-height: 68px; color: {INK}">MATCH OVER</h1>'
             f'{mono("M. Reyes vs D. Okafor · 06:00", 11, INK2, 500, 1.68)}'
             f'{body("Your rating isn&#39;t affected. You&#39;ll get a notification when the film is ready.", 13, INK2)}{fs}'
             f'{big_btn("Done", "Main.dc.html")}</div>')
    return inner


@board("P-VS-19-Timekeeper-States.dc.html", "Timekeeper, other states (joined, denied, leave, cancelled)")
def b19():
    s = sheet_title("Timekeeper: other states", "The timekeeper only records. One code per match: either player can show it.")
    s += caption("Face-off, someone joined (both players see this)") + tk_row("joined")
    s += caption("Join screen, camera access denied") + (
        f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px; display: flex; flex-direction: column; gap: 10px">'
        f'{body("Allow camera access to scan the code, or enter it below.", 13, INK)}{btn_secondary("Open Settings", 44, None, "align-self: flex-start")}</div>')
    s += caption("Join errors") + "".join(f'<p style="margin: 0">{body(t, 12, NEG)}</p>' for t in [
        "This match already has a timekeeper.", "This match has already started."])
    s += caption("Leave while recording") + (
        f'<div role="dialog" aria-label="Stop recording?" style="background: {PANEL}; border: 1px solid {HLS}; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px">'
        f'<h2 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 18px; color: {INK}">Stop recording?</h2>{body("What you&#39;ve recorded so far still uploads.", 13, INK2)}'
        f'{big_btn("Keep recording", "P-VS-16-Timekeeper-Recording.dc.html")}'
        f'<button type="button" style="min-height: 44px; border: 0; background: transparent; cursor: pointer; font-family: {DM}; font-weight: 700; font-size: 13px; letter-spacing: 1.12px; text-transform: uppercase; color: {NEG}">Stop recording</button></div>')
    s += caption("Match cancelled while joined") + (
        f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px; display: flex; flex-direction: column; gap: 10px">'
        f'{body("This match was cancelled. Nothing will upload.", 13, INK)}{big_btn("Done", "Main.dc.html")}</div>')
    s += caption("Landscape") + body("The recording screen rotates with the phone. Same elements: Leave, Recording, clock, names.", 12, INK2)
    return sheet(s)


# ========== %Term% card ==========
def reel_player(muted=True, h=420, w=236, label="Your %TERM%, 28 seconds"):
    vol = ("volx", "Unmute") if muted else ("vol", "Mute")
    return (f'<div style="position: relative; align-self: center; height: {h}px; width: {w}px; background: {BRIGHT}; border-radius: 4px; overflow: hidden">'
            f'<button aria-label="{label}" style="position: absolute; inset: 0; border: 0; padding: 0; background: {BRIGHT}; cursor: pointer; font-family: {MONO}; font-weight: 500; font-size: 10px; letter-spacing: 2px; color: rgba(232,237,242,0.35)">9:16 PLAYER</button>'
            f'<button type="button" aria-label="{vol[1]}" style="position: absolute; left: 7px; bottom: 7px; width: 44px; height: 44px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.88); border: 1px solid rgba(255,255,255,0.40); border-radius: 2px; color: #FFFFFF; cursor: pointer">{ic(vol[0], 20, "#FFFFFF")}</button>'
            f'<button type="button" aria-label="Watch full screen" style="position: absolute; right: 7px; bottom: 7px; width: 44px; height: 44px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.88); border: 1px solid rgba(255,255,255,0.40); border-radius: 2px; color: #FFFFFF; cursor: pointer">{ic("max", 18, "#FFFFFF")}</button></div>')


def reel_card(content):
    return (f'<div style="display: flex; flex-direction: column; gap: 10.5px">'
            f'<div style="font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 2.52px; text-transform: uppercase; color: {INK3}">Your %TERM%</div>'
            f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px; display: flex; flex-direction: column; gap: 10.5px">{content}</div></div>')


def text_btn(label, aria=None):
    a = f' aria-label="{aria}"' if aria else ""
    return (f'<button type="button"{a} style="align-self: flex-start; min-height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer; '
            f'font-family: {DM}; font-weight: 700; font-size: 13px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}">{label}</button>')


@board("P-VS-18-Reel-Card.dc.html", "%Term% card, mute, building, failed, fallback, late angle")
def b18():
    meta = lambda d, v, n: mono(f"{d}s · Version {v} · {n} angle{'s' if n > 1 else ''}", 12, INK3, 400, 0, False)
    steps = (f'<div style="display: flex; flex-direction: column; gap: 8px">'
             f'<div style="display: flex; flex-direction: row; gap: 8px; align-items: center">{ic("check", 14, INK)}{body("Finding your best moments", 13, INK)}</div>'
             f'<div style="display: flex; flex-direction: row; gap: 8px; align-items: center">{ic("loader", 14, AMBER)}{body("Cutting your %TERM%", 13, INK)}</div></div>')
    S = [
        ("Ready, inline autoplay starts muted", reel_card(reel_player(True) + meta(28, 1, 2))),
        ("Ready, sound on", reel_card(reel_player(False) + meta(28, 1, 2))),
        ("Building", reel_card(f'<div style="display: flex">{tag("Building", AMBER, AMBER_RULE)}</div>{body("Building your %TERM% from 2 angles", 14, INK, 500)}{steps}{body("Usually 1 to 3 minutes. You can leave this screen.", 12, INK2)}')),
        ("Failed", reel_card(body("We couldn&#39;t make your %TERM%.", 14, INK, 500) + btn_secondary("Try again", 44, "Try again: make your %TERM%", "align-self: flex-start"))),
        ("Fallback: no clear moment of yours", reel_card(reel_player(True, 300, 168) + meta(28, 1, 2) + body("We couldn&#39;t find a clear moment of yours, so this %TERM% shows the match&#39;s best moments.", 12, INK2))),
        ("Updated with a late angle (silent, no push)", reel_card(reel_player(True, 300, 168) + meta(30, 2, 2) + body("Updated with D. Okafor&#39;s angle.", 12, INK2))),
        ("Late angle after you shared or edited (no push)", reel_card(reel_player(True, 300, 168) + meta(28, 1, 1) + body("New angle available.", 12, INK2) + text_btn("Make a new version", "Make a new version with D. Okafor's angle"))),
    ]
    s = sheet_title("%Term% card", "One %TERM% per athlete per match, mixed from the best angles, built around your strongest moves. Original audio; mute is a playback toggle. No music this release.")
    for cap, html in S:
        s += caption(cap) + html
    return sheet(s)


# ---------------- write ----------------
def main():
    if not SRC:
        sys.exit("set CANVAS_SRC to the folder holding the live canvas boards (project/)")
    written = []
    for file, title, w, hfix, fn in BOARDS:
        inner = fn()
        h = hfix or HEIGHTS.get(file, 4000)
        title = title.replace("%Term%", TERM.capitalize())
        html = page(title, w, h, inner)
        open(os.path.join(OUT, file), "w").write(html)
        written.append((file, title, w, h))
    json.dump([{"file": f, "title": t.replace("%Term%", TERM.capitalize()), "w": w, "h": h} for f, t, w, h in written], open(os.path.join(HERE, "boards.json"), "w"), indent=2)
    print("\n".join(f"{f} {w}x{h}" for f, t, w, h in written))


if __name__ == "__main__":
    main()
