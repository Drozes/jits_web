"""Generates the "Proposed (Oct 6 Matches tab)" boards (DRAFT, NOT PUBLISHED).

Static markup only: this script writes .dc.html files; nothing in the boards is script-built.
Usage:
  python3 generate.py                 # first pass, every auto-height board at 4000 px
  ./measure.sh                        # headless Chrome writes heights.json
  python3 generate.py heights.json    # final pass with measured heights
Writes project/<board>.dc.html, boards.json and canvas-delta.json next to this file.

Sources of truth:
  Spec:   jits_web specs/matches-tab/spec.md (owner-approved 2026-10-06). Spec copy wins; every
          user-facing string below is listed in COPY-DECK.md with its spec id (C-*).
  Tokens: apps/mobile/lib/tokens.ts (dark) and onMediaTokens (ON_MEDIA). NativeWind rem = 14 px.
  Chrome: the live canvas boards Main, 11-Home-Resume, 17-Profile, 31-Film-Room and
          34-Highlight-Viewer at canvas version 1791309936-5b92. The Profile board is rebuilt
          from a snapshot of 17-Profile in src/ (set CANVAS_SRC to use a fresher copy).
No em dashes anywhere.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "project")
SRC = os.environ.get("CANVAS_SRC", os.path.join(HERE, "src"))
os.makedirs(OUT, exist_ok=True)
HEIGHTS = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else {}
CANVAS_VERSION = "1791310189-a890"

# ---- tokens (dark), apps/mobile/lib/tokens.ts ----
VOID, PANEL, PLATE, BRIGHT = "#0D0F14", "#13151B", "#1E222B", "#262A34"
INK, INK2, INK3 = "#E8EDF2", "#9CA3AF", "#8D929D"
RED, NEG, AMBER, GREEN = "#E63946", "#EC6A74", "#F59E0B", "#22C55E"
HL, HLF, HLS = "rgba(107,114,128,0.45)", "rgba(107,114,128,0.20)", "rgba(107,114,128,0.62)"
AMBER_RULE = "rgba(245,158,11,0.7)"
GLASS = "rgba(255,255,255,0.08)"  # palette.ts secondaryBg (the shipped filter chip fill)
# Unseen ring: the design system has no highlight accent token. The ring is a state edge, so it is
# drawn as `stroke-edge` (2 px) in `ink`: not signal-red (act / lose), not gain-green (gain, win,
# live), not attention (waiting). README "Unseen ring token" explains the pick.
RING = INK
# ON_MEDIA (onMediaTokens)
OM_WHITE, OM_TEXT, OM_TEXT2, OM_STRONG = "#FFFFFF", "#E8EDF2", "rgba(232,237,242,0.72)", "rgba(255,255,255,0.40)"
OM_BADGE, OM_SCRIM, OM_TRACK = "rgba(0,0,0,0.88)", "rgba(0,0,0,0.55)", "rgba(255,255,255,0.18)"
OM_CHIP, OM_CHIP_B, OM_INK = "rgba(232,235,240,0.96)", "rgba(13,15,20,0.34)", "#0D0F14"
OM_RED, OM_RED_RULE, OM_AMBER, OM_AMBER_RULE = "#F0556B", "rgba(240,85,107,0.7)", "#F59E0B", "rgba(245,158,11,0.7)"
PH = "rgba(232,237,242,0.35)"  # placeholder caption ink used by the shipped boards
MONO, DM, INTER, BEBAS = "'JetBrains Mono', monospace", "'DM Sans', sans-serif", "'Inter', sans-serif", "'Bebas Neue', sans-serif"

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'

# ---- copy (spec section 11; ids in COPY-DECK.md) ----
C = {
    "T1": "Matches", "M1": "Matches", "M2": "Your highlights", "HM1": "Your reels", "HM2": "See all",
    "M13": "DISPUTED", "M14": "Pending",
    "Z1": "Your first match will show up here", "Z2": "Your first highlight lands here", "Z2b": "Your first match lands here",
    "Z3": "0 of 1 matches to your first highlight", "Z4": "Find a match in the Arena", "Z5": "Try a practice match",
    "Z6": "Turn on Record from my phone at face-off and we cut your best moments into a highlight.",
    "HZ1": "Get your first highlight",
    "L1": "Your next match goes here", "L2": "Find a match", "L3": "FIRST MATCH", "L4": "FIRST WIN",
    "L5": "Record your next match to get a highlight", "L6": "Turn on Record from my phone at face-off.", "L7": "No film for this one",
    "B1": "Finding your best moments", "B2": "Cutting your highlight", "B3": "Waiting {mmss}", "B3z": "Any second now", "B4": "Usually 1 to 3 minutes",
    "C1": "First match in the books", "C2": "First win. That one counts.", "C3": "Your first highlight is ready",
    "E1t": "COULDN'T LOAD YOUR MATCHES", "E1b": "Check your connection and try again.", "E1a": "Try again",
    "E2": "Couldn't refresh your matches", "E3": "COULDN'T LOAD MORE. TAP TO RETRY",
    "F1t": "NO MATCHES FOR THIS FILTER YET", "F1b": "Older matches have not loaded yet.", "F1a": "Search older matches",
    "F2t": "NO MATCHES FOR THIS FILTER", "F2b": "Try another result or opponent.", "F2a": "Show all",
    "OFF": "You're offline. Some features may not work.",
}

# ---- lucide icons (lucide-react-native 1.16.0 geometry, 24 grid, stroke 2) ----
I = {
    "house": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
    "swords": '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" x2="19" y1="19" y2="13"></line><line x1="16" x2="20" y1="16" y2="20"></line><line x1="19" x2="21" y1="21" y2="19"></line><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"></polyline><line x1="5" x2="9" y1="14" y2="18"></line><line x1="7" x2="4" y1="17" y2="20"></line><line x1="3" x2="5" y1="19" y2="21"></line>',
    "clapper": '<path d="m12.296 3.464 3.02 3.956"></path><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"></path><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="m6.18 5.276 3.1 3.899"></path>',
    "trophy": '<path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"></path><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"></path><path d="M18 9h1.5a1 1 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6 9H4.5a1 1 0 0 1 0-5H6"></path>',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    "film": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M7 3v18"></path><path d="M3 7.5h4"></path><path d="M3 12h18"></path><path d="M3 16.5h4"></path><path d="M17 3v18"></path><path d="M17 7.5h4"></path><path d="M17 16.5h4"></path>',
    "history": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l4 2"></path>',
    "play": '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>',
    "chev_r": '<path d="m9 18 6-6-6-6"></path>',
    "chev_u": '<path d="m18 15-6-6-6 6"></path>',
    "x": '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    "bell": '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    "sparkles": '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path><path d="M20 2v4"></path><path d="M22 4h-4"></path><circle cx="4" cy="20" r="2"></circle>',
    "wifioff": '<path d="M12 20h.01"></path><path d="M8.5 16.429a5 5 0 0 1 7 0"></path><path d="M5 12.859a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.859a10 10 0 0 0-2.007-1.523"></path><path d="M2 8.82a15 15 0 0 1 4.177-2.643"></path><path d="M22 8.82a15 15 0 0 0-11.288-3.764"></path><path d="m2 2 20 20"></path>',
    "check": '<path d="M20 6 9 17l-5-5"></path>',
    "video": '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect>',
}


def ic(name, size=16, color="currentColor", sw=2, style=""):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: block; flex-shrink: 0{"; " + style if style else ""}">{I[name]}</svg>')


def q(t):
    """Text content: & and < escaped, straight apostrophes as entities (house style of the boards)."""
    return t.replace("&", "&amp;").replace("<", "&lt;").replace("'", "&#39;")


# ---- text atoms ----
def mono(t, size=10, color=INK3, w=500, ls=1.68, caps=True, extra=""):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<span style="font-family: {MONO}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.3)}px; '
            f'letter-spacing: {ls}px; font-variant-numeric: tabular-nums; {tt}color: {color}; white-space: nowrap{"; " + extra if extra else ""}">{q(t)}</span>')


def body(t, size=13, color=INK2, w=400, extra=""):
    return (f'<span style="font-family: {INTER}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.38)}px; '
            f'color: {color}{"; " + extra if extra else ""}">{q(t)}</span>')


def heading(t, size=16, color=INK, caps=False, ls=0, extra="", tag="span"):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<{tag} style="margin: 0; font-family: {DM}; font-weight: 700; font-size: {size}px; line-height: {round(size * 1.25)}px; '
            f'letter-spacing: {ls}px; {tt}color: {color}{"; " + extra if extra else ""}">{q(t)}</{tag}>')


def label_tag(t):
    """MetaTag, as shipped (Home 'Recent Activity', Profile 'Account')."""
    return (f'<span style="align-self: flex-start; display: inline-flex; align-items: center; padding: 3.5px 7px; border: 1px solid {HL}; '
            f'border-radius: 2px; font-family: {MONO}; font-weight: 400; font-size: 10px; line-height: 13px; color: {INK2}; '
            f'text-transform: uppercase; letter-spacing: 1.68px; white-space: nowrap">{q(t)}</span>')


def row(inner, gap=8, align="center", justify="flex-start", extra=""):
    return f'<div style="display: flex; flex-direction: row; align-items: {align}; justify-content: {justify}; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


def col(inner, gap=8, extra=""):
    return f'<div style="display: flex; flex-direction: column; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


def btn_primary(t, href, aria=None, extra=""):
    a = f' aria-label="{q(aria)}"' if aria else ""
    return (f'<a href="{href}"{a} style="background: {RED}; color: {VOID}; border-radius: 3px; min-height: 44px; box-sizing: border-box; padding: 8px 16px; '
            f'display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0{"; " + extra if extra else ""}">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; text-transform: uppercase; letter-spacing: 1.12px; text-align: center; color: {VOID}">{q(t)}</span></a>')


def btn_secondary(t, href=None, aria=None, extra="", h=44):
    a = f' aria-label="{q(aria)}"' if aria else ""
    tagn, hr = ("a", f' href="{href}"') if href else ("button", ' type="button"')
    return (f'<{tagn}{hr}{a} style="margin: 0; border: 1px solid {HLS}; border-radius: 3px; background: {PLATE}; min-height: {h}px; box-sizing: border-box; padding: 8px 16px; '
            f'display: flex; align-items: center; justify-content: center; gap: 10px; color: {INK}; cursor: pointer; flex-shrink: 0{"; " + extra if extra else ""}">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; text-transform: uppercase; letter-spacing: 1.12px; text-align: center; color: {INK}">{q(t)}</span></{tagn}>')


def btn_ghost(t, href=None, aria=None):
    a = f' aria-label="{q(aria)}"' if aria else ""
    tagn, hr = ("a", f' href="{href}"') if href else ("button", ' type="button"')
    return (f'<{tagn}{hr}{a} style="margin: 0; border: 0; background: transparent; min-height: 44px; box-sizing: border-box; padding: 8px 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; text-transform: uppercase; letter-spacing: 1.12px; color: {INK2}">{q(t)}</span></{tagn}>')


def text_btn(t, href, aria=None, color=INK, center=False):
    """A text button with a chevron, 44 px tall."""
    a = f' aria-label="{q(aria)}"' if aria else ""
    al = "align-self: center; " if center else "align-self: flex-start; "
    return (f'<a href="{href}"{a} style="{al}min-height: 44px; display: inline-flex; align-items: center; gap: 4px; color: {color}; flex-shrink: 0">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; letter-spacing: 1.12px; text-transform: uppercase; color: {color}">{q(t)}</span>{ic("chev_r", 14, color)}</a>')


def caption(t):
    """State caption between frames (as the Oct 4 boards)."""
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 0 16px">'
            f'{mono(t, 10, INK3, 700, 2.52, True, "white-space: normal; max-width: 300px")}<div style="flex: 1; min-width: 24px; height: 1px; background: {HLF}"></div></div>')


def note(t):
    return f'<p style="margin: 0; padding: 0 16px">{body(t, 12, INK3)}</p>'


def sheet_title(t, sub):
    return (f'<div style="display: flex; flex-direction: column; gap: 6px; padding: 0 16px">'
            f'{heading(t, 18, INK, tag="h1")}<p style="margin: 0">{body(sub, 12, INK2)}</p></div>')


def sheet(inner):
    """Auto-height state sheet body (frames are full 390 wide, captions inset 16)."""
    return f'<div style="padding: 47px 0 40px 0; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0">{inner}</div>'


def future_chip(t="Future, not in phase 1"):
    return (f'<span style="display: inline-flex; align-items: center; gap: 5px; height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; '
            f'border: 1px solid {HLS}; background: {VOID}; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; '
            f'text-transform: uppercase; color: {INK2}; white-space: nowrap">{ic("lock", 11, INK2)}{q(t)}</span>')


def bullets(items, size=12, color=INK2, pad=0):
    return col("".join(row(f'<span style="width: 4px; height: 4px; margin-top: {round(size * 0.55)}px; background: {INK3}; flex-shrink: 0"></span>' + body(t, size, color), 10, "flex-start") for t in items),
               7, f"padding: 0 {pad}px")


# ---- chrome ----
def tab_header(title, bell_badge=False, inset=True):
    """TabHeader (title) or BrandHeader (title None). inset=False drops the 47 px status-bar inset."""
    badge = (f'<span aria-hidden="true" style="position: absolute; top: 0; right: 0; min-width: 14px; min-height: 14px; box-sizing: border-box; padding: 0 3.5px; '
             f'border-radius: 2px; background: {RED}; display: flex; align-items: center; justify-content: center; font-family: {MONO}; font-weight: 700; '
             f'font-size: 9px; line-height: 12px; color: {VOID}">1</span>') if bell_badge else ""
    if title is None:
        left = f'<div style="font-family: {BEBAS}; font-weight: 400; font-size: 22px; line-height: 22px; letter-spacing: -0.07px; color: {INK}; flex-shrink: 0">ELO RATED</div>'
        padx = 14  # BrandHeader px-4
    else:
        left = f'<h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.68px; flex-shrink: 0">{q(title)}</h1>'
        padx = 16  # TabHeader max(16, inset)
    hh = "height: 103px; padding: 47px" if inset else "height: 56px; padding: 0"
    return (f'<header style="flex-shrink: 0; box-sizing: border-box; {hh} {padx}px 0; background: {PANEL}; border-bottom: 1px solid {HL}; '
            f'display: flex; align-items: center; justify-content: space-between; gap: 12px">{left}'
            f'<div style="display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex: 1 1 auto; min-width: 0">'
            f'<button type="button" aria-label="Live status: 5 on the mat. Go live" style="cursor: pointer; font: inherit; color: inherit; height: 28px; box-sizing: border-box; '
            f'display: inline-flex; align-items: center; gap: 5px; margin: 0; padding: 0 8px; border: 1px solid {INK3}; border-radius: 2px; background: transparent; max-width: 160px; overflow: hidden; flex-shrink: 1">'
            f'<span aria-hidden="true" style="width: 6px; height: 6px; box-sizing: border-box; border-radius: 3px; border: 1px solid {INK3}; flex-shrink: 0"></span>'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; text-transform: uppercase; color: {INK3}; font-variant-numeric: tabular-nums; white-space: nowrap">GO LIVE · 5</span></button>'
            f'<a href="42-Notifications-Panel.dc.html" aria-label="Notifications{", 1 new" if bell_badge else ""}" style="position: relative; width: 28px; height: 28px; border-radius: 2px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: {INK}">'
            f'{ic("bell", 18, INK)}{badge}</a></div></header>')


M_HREF = "P-MT-02-Matches-Default.dc.html"
HOME_HREF = "P-MT-05-Home-Default.dc.html"
PROFILE_HREF = "P-MT-09-Profile-Clean.dc.html"
VIEWER_HREF = "P-MT-08-Reel-Viewer.dc.html"
ARENA_HREF = "12-Arena-Offline.dc.html"
TABS = [("home", "Home", "house", HOME_HREF),
        ("arena", "Arena", "swords", ARENA_HREF),
        ("matches", "Matches", "film", M_HREF),
        ("rankings", "Rankings", "trophy", "16-Rankings.dc.html"),
        ("profile", "Profile", "user", PROFILE_HREF)]


def tab_bar(active, safe=True):
    out = ""
    for key, lab, icon, href in TABS:
        on = key == active
        c = INK if on else INK3
        cur = ' aria-current="page"' if on else ""
        out += (f'<a href="{href}"{cur} style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3.5px; '
                f'padding: 10.5px 0; border-top: 2px solid {RED if on else "transparent"}; color: {c}">'
                f'<span style="position: relative; display: block">{ic(icon, 18, c)}</span>'
                f'<span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; text-transform: uppercase; letter-spacing: 1.68px; color: {c}; white-space: nowrap">{lab}</span></a>')
    pb = "34px" if safe else "0"
    return f'<nav aria-label="Tabs" style="flex-shrink: 0; background: {PANEL}; border-top: 1px solid {HL}; display: flex; padding-bottom: {pb}">{out}</nav>'


def screen(header, main_inner, active, main_pad="16px 16px 32px", gap=16):
    return (header + f'<main style="flex: 1 1 auto; min-height: 0; overflow: hidden; box-sizing: border-box; padding: {main_pad}; display: flex; flex-direction: column; gap: {gap}px">'
            + main_inner + '</main>' + tab_bar(active))


def frame(inner, h=None, extra=""):
    """A 390-wide phone frame inside a sheet board (no status bar), hairline edge top and bottom."""
    hh = f"height: {h}px; " if h else ""
    return (f'<div style="width: 390px; {hh}box-sizing: border-box; overflow: hidden; position: relative; background: {VOID}; '
            f'border-top: 1px solid {HLF}; border-bottom: 1px solid {HLF}; display: flex; flex-direction: column; flex-shrink: 0{"; " + extra if extra else ""}">{inner}</div>')


def frame_body(inner, pad="16px", gap=16, extra=""):
    return f'<div style="padding: {pad}; display: flex; flex-direction: column; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


# ---- identity and data atoms ----
def athlete_tile(init, size=40, fs=13, ghost=False, unknown=False):
    """AthleteTile (film-room): square, radius-tag, hairline-strong, plate-bright, initials."""
    if unknown:
        return (f'<div aria-hidden="true" style="width: {size}px; height: {size}px; box-sizing: border-box; border-radius: 2px; border: 1px dashed {HLS}; '
                f'display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: {fs}px; color: {INK3}">?</div>')
    return (f'<div aria-hidden="true" style="width: {size}px; height: {size}px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; '
            f'display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: {fs}px; letter-spacing: 1.12px; color: {INK}{"; opacity: 0.6" if ghost else ""}">{init}</div>')


def avatar24(init):
    """Opponent avatar in the meta row: 24 pt square (Avatar32 look), F·L initials in mono bold 10."""
    return (f'<div aria-hidden="true" style="width: 24px; height: 24px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; '
            f'display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {MONO}; font-weight: 700; font-size: 10px; color: {INK}">{init}</div>')


def outcome(o):
    c, b = {"W": (GREEN, GREEN), "L": (NEG, "rgba(236,106,116,0.7)"), "D": (INK3, HLS)}[o]
    return (f'<span aria-hidden="true" style="height: 18px; min-width: 18px; box-sizing: border-box; padding: 0 4px; border-radius: 2px; border: 1px solid {b}; '
            f'display: inline-flex; align-items: center; justify-content: center; font-family: {MONO}; font-weight: 700; font-size: 11px; line-height: 14px; color: {c}">{o}</span>')


def delta(d):
    """deltaLabel (lib/film-room/format.ts). A draw delta in a list is neutral; amber is only for the verdict, DeltaChip, EloTile and stakes."""
    if d is None:
        return mono(C["M14"], 11, AMBER, 700, 1.12, True)
    if d > 0:
        return mono(f"▲ +{d}", 12, GREEN, 700, 0.56, False)
    if d < 0:
        return mono(f"▼ −{abs(d)}", 12, NEG, 700, 0.56, False)
    return mono("± 0", 12, INK3, 700, 0.56, False)  # neutral in lists (poster-card D colours)


def meta_tag(t, tone="ink"):
    c, b = {"ink": (INK, HLS), "amber": (AMBER, AMBER_RULE)}[tone]
    return (f'<span style="height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 2px; border: 1px solid {b}; display: inline-flex; align-items: center; '
            f'font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; text-transform: uppercase; color: {c}; white-space: nowrap">{q(t)}</span>')


def badge(t, tone):
    """FilmBadge (status-badge.tsx). tone: light|amber|outline|red|muted."""
    bg, fg, bd = {"light": (OM_CHIP, OM_INK, OM_CHIP_B), "amber": (OM_BADGE, OM_AMBER, OM_AMBER_RULE), "outline": (OM_BADGE, OM_TEXT, OM_STRONG),
                  "red": (OM_BADGE, OM_RED, OM_RED_RULE), "muted": (OM_BADGE, OM_TEXT2, OM_STRONG)}[tone]
    return (f'<span style="height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; display: inline-flex; align-items: center; background: {bg}; '
            f'border: 1px solid {bd}; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; font-variant-numeric: tabular-nums; '
            f'text-transform: uppercase; color: {fg}; white-space: nowrap">{q(t)}</span>')


def play_glyph(size=48):
    return (f'<span aria-hidden="true" style="position: absolute; left: 50%; top: 50%; width: {size}px; height: {size}px; margin: -{size // 2}px 0 0 -{size // 2}px; box-sizing: border-box; '
            f'border-radius: 4px; background: {OM_BADGE}; border: 1px solid {OM_STRONG}; display: flex; align-items: center; justify-content: center">'
            f'{ic("play", 20, OM_WHITE, 2, "margin-left: 2px")}</span>')


# ---- MatchFeedCard (spec 6.2): media 16:9 at screen width minus 32, then the meta row ----
MW, MH = 358, 201


def media(kind, aria, badge_=None, dur=None, a=("MR", "DO"), href="33-Video-Player.dc.html", helper=False, pct=None, retry=False, cap=None):
    """kind: landscape | portrait | fallback | upload (fallback art plus an upload overlay)."""
    top = f'<div style="position: absolute; top: 8px; left: 8px; display: flex; gap: 4px">{badge(*badge_)}</div>' if badge_ else ""
    playable = kind in ("landscape", "portrait")
    if kind == "landscape":
        inner = (f'<div style="position: absolute; inset: 0; background: {BRIGHT}; display: flex; align-items: flex-start; justify-content: center; padding-top: 40px; box-sizing: border-box; '
                 f'font-family: {MONO}; font-weight: 500; font-size: 10px; letter-spacing: 2px; color: {PH}">LANDSCAPE STILL, COVER</div>')
    elif kind == "portrait":
        # Spec 6.3 crop rule: blurred cover copy behind, 40% void scrim, the full frame contained in front.
        blur = (f'<div aria-hidden="true" style="position: absolute; inset: -20px; background: {BRIGHT}; filter: blur(12px)">'
                f'<div style="position: absolute; left: 30%; top: 25%; width: 40%; height: 60%; background: #3A3F4B; border-radius: 40%"></div>'
                f'<div style="position: absolute; left: 10%; top: 55%; width: 25%; height: 40%; background: #30343F"></div>'
                f'<div style="position: absolute; right: 8%; top: 10%; width: 22%; height: 45%; background: #2E3340"></div></div>'
                f'<div aria-hidden="true" style="position: absolute; inset: 0; background: rgba(13,15,20,0.4)"></div>')
        fw = round(MH * 9 / 16)
        front = (f'<div style="position: absolute; top: 0; bottom: 0; left: 50%; width: {fw}px; margin-left: -{fw / 2}px; background: {BRIGHT}; '
                 f'display: flex; align-items: flex-start; justify-content: center; padding-top: 30px; box-sizing: border-box; font-family: {MONO}; font-weight: 500; font-size: 9px; '
                 f'line-height: 13px; letter-spacing: 1.6px; color: {PH}; text-align: center">PORTRAIT<br>STILL 9:16<br>CONTAIN</div>')
        inner = blur + front
    else:
        capline = cap if cap is not None else (C["L7"] if kind == "fallback" else "")
        hl = f'<p style="margin: 0; padding: 0 24px; text-align: center">{body(C["L6"], 12, INK2)}</p>' if helper else ""
        track = ""
        if pct is not None:
            track = (f'<div aria-hidden="true" style="position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: {OM_TRACK}">'
                     f'<div style="width: {pct}%; height: 3px; background: {OM_TEXT}"></div></div>')
        rb = btn_secondary("Try again", aria=f"Try again: upload match video vs {a[1]}", extra=f"background: {BRIGHT}; min-width: 140px") if retry else ""
        capm = mono(capline, 10, INK2, 500, 1.68) if capline else ""
        inner = (f'<div style="position: absolute; inset: 0; background: {PLATE}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px">'
                 f'{row(athlete_tile(a[0]) + f"<span style=\"font-family: {BEBAS}; font-size: 12px; color: {NEG}\">VS</span>" + athlete_tile(a[1]), 8)}{capm}{hl}{rb}</div>{track}')
    d = (f'<span style="position: absolute; right: 8px; bottom: 8px; height: 20px; box-sizing: border-box; padding: 0 6px; border-radius: 2px; display: inline-flex; align-items: center; '
         f'background: {OM_BADGE}; font-family: {MONO}; font-weight: 700; font-size: 11px; line-height: 14px; letter-spacing: 0.56px; font-variant-numeric: tabular-nums; color: {OM_WHITE}">{dur}</span>') if (dur and playable) else ""
    glyph = play_glyph() if playable else ""
    tagn = "a"
    hr = href if playable else "32-Match-Detail.dc.html"
    return (f'<{tagn} href="{hr}" aria-label="{q(aria)}" style="position: relative; display: block; width: {MW}px; height: {MH}px; flex-shrink: 0; overflow: hidden; '
            f'border-radius: 3px; border: 1px solid {HL}; box-sizing: border-box; color: inherit">{inner}{glyph}{top}{d}</{tagn}>')


def meta_row(init, opp, o, d, date, tags=(), disputed=False):
    word = {"W": "Won", "L": "Lost", "D": "Draw"}[o]
    dd = "Elo pending" if d is None else ("no change" if d == 0 else (f"plus {d}" if d > 0 else f"minus {abs(d)}"))
    aria = f"Open match vs {opp}. {word}, {dd}, {date.title()}"
    extra = "".join(meta_tag(t) for t in tags) + (meta_tag(C["M13"], "amber") if disputed else "")
    return (f'<a href="32-Match-Detail.dc.html" aria-label="{q(aria)}" style="display: flex; flex-direction: row; align-items: flex-start; gap: 10px; padding: 12px 0 4px; box-sizing: border-box; min-height: 56px; color: {INK}">'
            f'{avatar24(init)}<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px">'
            f'{heading("vs " + opp, 16, INK, extra="white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}'
            f'{row(outcome(o) + delta(d) + mono("·", 12, INK3, 500, 0, False) + mono(date, 11, INK3, 500, 1.12) + extra, 7, extra="flex-wrap: wrap")}</div>'
            f'<span aria-hidden="true" style="width: 24px; height: 44px; display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0">{ic("chev_r", 18, INK3)}</span></a>')


def card(m, meta):
    return f'<article style="display: flex; flex-direction: column; flex-shrink: 0">{m}{meta}</article>'


def ghost_card(cap, init="AL", action=None, clips=True):
    """Spec 10.2 / 10.3: the MatchFeedCard silhouette, dashed 16:9, viewer left, '?' opponent right."""
    act = text_btn(action, ARENA_HREF, f"{action} in the Arena", INK, center=True) if action else ""
    m = (f'<div aria-label="{q(cap)}" style="position: relative; width: {MW}px; height: {MH}px; box-sizing: border-box; border: 1px dashed {HLS}; border-radius: 3px; '
         f'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; flex-shrink: 0">'
         f'{row(athlete_tile(init, 40, 13, ghost=True) + f"<span style=\"font-family: {BEBAS}; font-size: 12px; color: {INK3}\">VS</span>" + athlete_tile("", 40, 13, unknown=True), 8)}'
         f'{mono(cap, 10, INK2, 700, 1.68, True, "white-space: normal; text-align: center; padding: 0 24px")}{act}</div>')
    sk = (f'<div aria-hidden="true" style="display: flex; flex-direction: row; gap: 10px; padding: 12px 0 0">'
          f'<div style="width: 24px; height: 24px; box-sizing: border-box; border: 1px dashed {HL}; border-radius: 2px"></div>'
          f'<div style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding-top: 3px"><div style="width: 45%; height: 9px; box-sizing: border-box; border-radius: 2px; border: 1px dashed {HL}"></div>'
          f'<div style="width: 30%; height: 8px; box-sizing: border-box; border-radius: 2px; border: 1px dashed {HL}"></div></div></div>')
    return f'<article style="display: flex; flex-direction: column; flex-shrink: 0">{m}{sk}</article>'


def record_strip(t):
    return mono(t, 11, INK2, 500, 1.68, True, "flex-shrink: 0")


def month_header(t, n):
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10px; flex-shrink: 0; margin-top: 6px">'
            f'<h2 style="margin: 0; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 2.52px; color: {INK2}">{t}</h2>'
            f'<div style="flex: 1; height: 1px; background: {HL}"></div>{mono(n, 10, INK3, 500)}</div>')


def chips(sel="All"):
    """FilterChips, unchanged (shipped look: ink fill when on, glass fill and hairline-strong when off)."""
    out = ""
    for lab in ["All", "Wins", "Losses", "Draws", "Opponent ▾"]:
        on = lab == sel
        role = 'role="tab" aria-selected="' + ("true" if on else "false") + '"' if lab != "Opponent ▾" else 'aria-label="Filter by opponent"'
        out += (f'<button type="button" {role} style="flex-shrink: 0; height: 36px; padding: 0 14px; margin: 0; border-radius: 2px; '
                f'border: 1px solid {INK if on else HLS}; background: {INK if on else GLASS}; color: {VOID if on else INK}; font-family: {MONO}; font-weight: 700; font-size: 11px; '
                f'letter-spacing: 1.68px; text-transform: uppercase; cursor: pointer; white-space: nowrap">{q(lab)}</button>')
    return f'<div role="tablist" aria-label="Filter matches" style="display: flex; flex-direction: row; gap: 8px; margin: 0 -16px; padding: 0 16px; overflow: hidden; flex-shrink: 0">{out}</div>'


def panel(title, text, action=None, href="#"):
    """Shipped film-room Panel: mono caps title, body, red mono caps action."""
    act = (f'<a href="{href}" aria-label="{q(action)}" style="min-height: 44px; display: inline-flex; align-items: center; color: {NEG}">'
           f'{mono(action, 10, NEG, 700, 1.68)}</a>') if action else ""
    return (f'<div style="margin-top: 24px; padding: 0 24px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; flex-shrink: 0">'
            f'{mono(title, 11, INK, 700, 1.68, True, "white-space: normal")}<p style="margin: 0">{body(text, 13, INK2)}</p>{act}</div>')


def toast(title, tone=RED):
    return (f'<div role="status" style="display: flex; flex-direction: row; align-items: center; gap: 10px; background: {PLATE}; border: 1px solid {HLS}; border-left: 3px solid {tone}; '
            f'border-radius: 4px; padding: 12px 14px; flex-shrink: 0">{heading(title, 13, INK)}</div>')


def offline_banner():
    return (f'<div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; padding: 7px 14px; background: {PANEL}; border-bottom: 1px solid {HLS}; flex-shrink: 0">'
            f'{ic("wifioff", 14, INK)}{mono(C["OFF"], 10, INK, 500, 1.12, True, "white-space: normal; text-align: center")}</div>')


# ---- reel tiles (spec 5): home 104 x 185, matches 96 x 171 ----
SIZES = {"home": (104, 185), "matches": (96, 171)}


def tile_slot(tile, size, under=None, under2=None, ring=False, href=None, aria="", pulse=False):
    """One carousel slot. The ring is a 2 px `ink` stroke-edge with a 2 px surface gap, so every slot
    reserves 4 px around its tile and the tiles keep an 8 px visual gap at gap 0."""
    tw, th = SIZES[size]
    bd = f"2px solid {RING}" if ring else "2px solid transparent"
    tagn = "a" if href else "div"
    hr = f' href="{href}"' if href else ""
    pl = (f'<div aria-hidden="true" style="position: absolute; inset: -4px; border: 2px solid rgba(232,237,242,0.35); border-radius: 9px"></div>') if pulse else ""
    u = heading(under, 12, INK, extra="white-space: nowrap; overflow: hidden; text-overflow: ellipsis") if under else ""
    u2 = mono(under2, 10, INK3, 500, 1.12, False, "white-space: normal") if under2 else ""
    # Two caption lines are always reserved so tile baselines align across a lane.
    lab = f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 0 4px; width: {tw}px; min-height: 30px; box-sizing: content-box">{u}{u2}</div>'
    al = f' aria-label="{q(aria)}"' if aria else ' aria-hidden="true"'
    return (f'<{tagn}{hr}{al} style="flex-shrink: 0; width: {tw + 8}px; display: flex; flex-direction: column; gap: 6px; color: {INK}">'
            f'<div style="position: relative; box-sizing: border-box; width: {tw + 8}px; height: {th + 8}px; padding: 2px; border: {bd}; border-radius: 6px">{pl}{tile}</div>{lab}</{tagn}>')


def t_ready(size, dur):
    tw, th = SIZES[size]
    return (f'<div style="position: relative; width: {tw}px; height: {th}px; border-radius: 4px; overflow: hidden; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 9px; letter-spacing: 1.6px; color: {PH}">REEL 9:16</span>'
            f'<span style="position: absolute; bottom: 5px; left: 5px; height: 18px; box-sizing: border-box; padding: 0 5px; display: inline-flex; align-items: center; border-radius: 2px; background: {OM_BADGE}; '
            f'font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {OM_WHITE}; font-variant-numeric: tabular-nums">{dur}</span></div>')


def seg2(step):
    segs = "".join(f'<div style="flex: 1; height: 3px; background: {OM_TEXT if i < step - 1 else (OM_AMBER if i == step - 1 else OM_TRACK)}"></div>' for i in range(2))
    return f'<div aria-hidden="true" style="display: flex; flex-direction: row; gap: 3px">{segs}</div>'


def t_building(size, step=2, wait=None):
    """Spec 10.5: poster (or monogram pair) under a dark scrim, a shimmer sweep, the two-step line."""
    tw, th = SIZES[size]
    if wait is not None:
        line = mono(C["B3z"] if wait == "0:00" else C["B3"].replace("{mmss}", wait), 11, OM_AMBER, 700, 1.12, True, "white-space: normal")
        prog = ""
    else:
        line = heading(C["B1"] if step == 1 else C["B2"], 12, OM_TEXT, extra="white-space: normal")
        prog = seg2(step) + mono(f"Step {step} of 2", 10, OM_TEXT2, 500, 1.12, False)
    return (f'<div style="position: relative; width: {tw}px; height: {th}px; box-sizing: border-box; border-radius: 4px; overflow: hidden; background: {BRIGHT}">'
            f'<span style="position: absolute; top: 46px; left: 0; right: 0; text-align: center; font-family: {MONO}; font-weight: 700; font-size: 9px; letter-spacing: 1.6px; color: {PH}">POSTER</span>'
            f'<div aria-hidden="true" style="position: absolute; inset: 0; background: {OM_SCRIM}"></div>'
            f'<div aria-hidden="true" style="position: absolute; top: 0; bottom: 0; left: 18%; width: 40%; background: rgba(232,237,242,0.08); transform: skewX(-12deg)"></div>'
            f'<div style="position: absolute; left: 6px; right: 6px; bottom: 6px; box-sizing: border-box; padding: 7px; border-radius: 2px; background: {OM_BADGE}; display: flex; flex-direction: column; gap: 6px">'
            f'{ic("sparkles", 14, OM_AMBER)}{line}{prog}</div></div>')


def t_ghost(size, line, fade=1.0, silhouette=True):
    tw, th = SIZES[size]
    sil = f'<div style="flex: 1; display: flex; align-items: center; justify-content: center">{ic("user", 28, INK3, 1.5)}</div>' if silhouette else '<div style="flex: 1"></div>'
    ln = body(line, 11, INK2, 500) if line else ""
    return (f'<div style="width: {tw}px; height: {th}px; box-sizing: border-box; border-radius: 4px; border: 1px dashed {HLS}; opacity: {fade}; '
            f'padding: 10px 8px; display: flex; flex-direction: column; gap: 8px">{sil}{ln}</div>')


def t_cta(size, label, icon="swords"):
    tw, th = SIZES[size]
    return (f'<div style="width: {tw}px; height: {th}px; box-sizing: border-box; border-radius: 3px; border: 1px solid {HLS}; background: {PLATE}; '
            f'padding: 12px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center">'
            f'{ic(icon, 22, INK)}{heading(label, 12, INK, caps=True, ls=1.12, extra="text-align: center")}</div>')


def t_see_all(size):
    tw, th = SIZES[size]
    return (f'<div style="width: {tw}px; height: {th}px; box-sizing: border-box; border-radius: 4px; border: 1px solid {HL}; background: {PLATE}; '
            f'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px">{heading(C["HM2"], 12, INK, caps=True, ls=1.12)}{ic("chev_r", 16, INK2)}</div>')


def t_skeleton(size):
    tw, th = SIZES[size]
    return (f'<div aria-hidden="true" style="position: relative; overflow: hidden; width: {tw}px; height: {th}px; border-radius: 4px; background: {BRIGHT}">'
            f'<div style="position: absolute; top: 0; bottom: 0; left: 30%; width: 40%; background: rgba(232,237,242,0.08)"></div></div>')


def carousel(slots):
    """Horizontal FlatList: 16 px gutter (slot reserve 4 px, so the strip starts at 12), 8 px visual gap."""
    return (f'<div role="list" style="display: flex; flex-direction: row; gap: 0; margin: 0 -16px; padding: 0 12px; overflow: hidden; flex-shrink: 0">{"".join(slots)}</div>')


def lane(title, slots, see_all=None, after=""):
    hdr = row(label_tag(title) + (text_btn(C["HM2"], see_all, "See all, open Matches", INK2) if see_all else ""), 8, "center", "space-between", "min-height: 20px")
    return col(hdr + carousel(slots) + after, 10, "flex-shrink: 0")


def helper_line(t, icon="video"):
    return row(ic(icon, 14, INK3) + body(t, 12, INK2), 6, "flex-start", extra="flex-shrink: 0")


# ---- sample data (viewer: Marcus Reyes, MR, 1487, 21 matches 14W 6L 1D) ----
def m_lane(size="matches", first_pulse=False):
    return [
        tile_slot(t_building(size, 2), size, "vs L. Tanaka", C["B4"], aria="Building your highlight vs L. Tanaka, step 2 of 2. Opens the match"),
        tile_slot(t_ready(size, "28s"), size, "vs D. Okafor", ring=True, pulse=first_pulse, href=VIEWER_HREF, aria="Watch your highlight vs D. Okafor, unwatched"),
        tile_slot(t_ready(size, "21s"), size, "vs P. Shah", href=VIEWER_HREF, aria="Watch your highlight vs P. Shah"),
        tile_slot(t_ready(size, "34s"), size, "vs S. Whitfield", href=VIEWER_HREF, aria="Watch your highlight vs S. Whitfield"),
    ]


def c_okafor():
    return card(media("landscape", "Play match vs D. Okafor", ("NEW", "light"), "4:12"), meta_row("D·O", "D. Okafor", "W", 18, "OCT 04"))


def c_tanaka():
    return card(media("landscape", "Play match vs L. Tanaka", ("BUILDING HIGHLIGHT", "amber"), "6:00"), meta_row("L·T", "L. Tanaka", "L", -11, "OCT 03"))


def c_shah_portrait():
    return card(media("portrait", "Play match vs P. Shah", ("BREAKDOWN READY", "outline"), "3:05"), meta_row("P·S", "P. Shah", "D", 0, "OCT 02"))


def c_cruz_nofilm(helper=True):
    return card(media("fallback", "No film. Open match vs J. Cruz", a=("MR", "JC"), helper=helper), meta_row("J·C", "J. Cruz", "W", 7, "OCT 01"))


def c_whitfield_disputed():
    return card(media("landscape", "Play match vs S. Whitfield", ("BREAKDOWN READY", "outline"), "5:31"), meta_row("S·W", "S. Whitfield", "L", None, "SEP 29", disputed=True))


# =========================================================== BOARDS
BOARDS = []  # (file, title, w, html_fn)


def board(file, title, w=390):
    def deco(fn):
        BOARDS.append((file, title, w, fn))
        return fn
    return deco


# ---------- 01 tab bar ----------
@board("P-MT-01-Tab-Bar.dc.html", "Proposed: Tab bar, 5 tabs (Home · Arena · Matches · Rankings · Profile)")
def b01():
    s = sheet_title("Tab bar: Home · Arena · Matches · Rankings · Profile",
                    "Matches is the new third tab, lucide Film (spec PM10). EloTabBar is unchanged: flex-1 columns read off the navigator, active tab is ink with the 2 px signal-red top edge, inactive is ink-3, labels DM Sans 700 10 px caps at 1.68 px tracking.")
    for key, lab, _, _ in TABS:
        s += caption(f"{lab} active, 390 pt (78 pt per tab)") + tab_bar(key, safe=False)
    s += caption("375 pt check (75 pt per tab)")
    s += f'<div style="width: 375px; align-self: flex-start">{tab_bar("rankings", safe=False)}</div>'
    s += note("RANKINGS is the widest label, about 62 pt at this size and tracking, so every label fits on one line at 375 and 390 (AC 1.3). If a device test truncates it, the fix is one shared label size or tracking token for all five tabs, never a per-tab exception (spec 4.1).")
    s += caption("Icon")
    opts = [("film", "Film (chosen, spec PM10)", "Reads as my footage; distinct from the Arena blades and the Rankings trophy; already in lucide-react-native, no install."),
            ("clapper", "Clapperboard (not chosen)", "Already means one highlight (the Home highlight card and the empty poster); reusing it for the whole history would blur the two."),
            ("history", "History (not chosen)", "Reads as a log; loses the film promise that makes the tab worth opening.")]
    for icn, nm, why in opts:
        s += (f'<div style="display: flex; flex-direction: row; gap: 12px; align-items: flex-start; padding: 0 16px">'
              f'<span style="width: 44px; height: 44px; box-sizing: border-box; border: 1px solid {HL}; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0">{ic(icn, 18, INK if icn == "film" else INK3)}</span>'
              f'{col(heading(nm, 13, INK) + body(why, 12, INK2), 2)}</div>')
    s += caption("Badges")
    s += note("No badge on Matches in phase 1 (spec PM9): the Arena keeps the only tab badge (count, live dot, hollow ring, embers), and unseen reels already ring on Home. The upload strip (TabsUploadStrip) still sits on the bar on every tab, Matches included (AC 2.14).")
    return sheet(s)


# ---------- 02 Matches default ----------
@board("P-MT-02-Matches-Default.dc.html", "Proposed: Matches tab, default (record strip, Your highlights, chips, feed)")
def b02():
    m = (record_strip("21 MATCHES · 14W 6L 1D · 1487")
         + lane(C["M2"], m_lane())
         + chips("All")
         + month_header("OCTOBER 2026", "4 MATCHES")
         + c_okafor() + c_tanaka() + c_shah_portrait() + c_cruz_nofilm()
         + month_header("SEPTEMBER 2026", "6 MATCHES")
         + c_whitfield_disputed())
    return screen(tab_header(C["M1"]), m, "matches", gap=16)


# ---------- 03 card states ----------
@board("P-MT-03-Card-States.dc.html", "Proposed: Matches tab, MatchFeedCard states (badge priority, crop rule, tags)")
def b03():
    S = [
        ("Didn't upload (this phone, Try again works)",
         card(media("upload", "Your video didn't upload. Open match vs P. Shah", ("DIDN'T UPLOAD", "red"), a=("MR", "PS"), retry=True, cap=""), meta_row("P·S", "P. Shah", "W", 9, "OCT 03")),
         "Highest priority. Red only while Try again can work; a terminal failure is the muted tone. No play glyph, no duration."),
        ("Upload paused (this phone)",
         card(media("upload", "Upload paused. Open match vs L. Tanaka", ("UPLOAD PAUSED", "amber"), a=("MR", "LT"), cap="Still arrives after upload"), meta_row("L·T", "L. Tanaka", "L", -11, "OCT 04")), None),
        ("Uploading on this phone (overlay with track)",
         card(media("upload", "Uploading 42 percent. Open match vs D. Okafor", ("UPLOADING 42%", "amber"), a=("MR", "DO"), pct=42, cap=""), meta_row("D·O", "D. Okafor", "W", 18, "OCT 04")), None),
        ("Waiting for another angle", card(media("landscape", "Play match vs S. Whitfield", ("WAITING 8:12", "amber"), "5:31"), meta_row("S·W", "S. Whitfield", "L", -9, "OCT 03")),
         "Your angle is playable, so the poster, play glyph and duration show while the match waits."),
        ("Building highlight", c_tanaka(), None),
        ("Uploading (collecting, another phone)", card(media("landscape", "Play match vs J. Cruz", ("UPLOADING", "amber"), "6:00"), meta_row("J·C", "J. Cruz", "D", 0, "OCT 02")), None),
        ("New (unseen, fresh)", c_okafor(), "Opening either target clears NEW (markMatchSeen, AC 2.15)."),
        ("Breakdown ready", card(media("landscape", "Play match vs P. Shah", ("BREAKDOWN READY", "outline"), "6:00"), meta_row("P·S", "P. Shah", "W", 12, "SEP 27")), None),
        ("Failed (server processing failed)", card(media("fallback", "Film failed to process. Open match vs R. Alves", ("FAILED", "red"), a=("MR", "RA"), cap="Film failed to process"), meta_row("R·A", "R. Alves", "L", -6, "SEP 25")),
         "Shipped FAILED badge in the red tone with the poster-card fallback caption. No play glyph."),
        ("Processing (film landed, not playable yet)", card(media("fallback", "Processing film. Open match vs K. Ito", a=("MR", "KI"), cap="Processing film"), meta_row("K·I", "K. Ito", "W", 11, "SEP 25")),
         "Processing is never a card badge: the fallback art carries the shipped PROCESSING FILM caption instead."),
        ("No film (film came in, none usable)", card(media("fallback", "No film. Open match vs L. Tanaka", ("NO FILM", "muted"), a=("MR", "LT"), cap=""), meta_row("L·T", "L. Tanaka", "D", 0, "SEP 24")),
         "Muted badge, fallback art, no play glyph. Media tap opens match detail."),
        ("No film recorded (no badge)", c_cruz_nofilm(helper=False),
         "Fallback art with C-L7. Only the first no-film card in the loaded list adds the recording helper (see board 02)."),
        ("Portrait footage: pillarbox", c_shah_portrait(),
         "Crop rule (spec 6.3): width / height below 1.0 shows the whole frame contained, over a blurred cover copy of the same image (blurRadius 24) under a 40% void scrim. Landscape and square fill with cover. Unknown size: cover until expo-image onLoad reports the size."),
        ("Landscape footage: cover", card(media("landscape", "Play match vs R. Alves", ("BREAKDOWN READY", "outline"), "7:48"), meta_row("R·A", "R. Alves", "W", 15, "SEP 18")), None),
        ("Disputed, delta pending", c_whitfield_disputed(), "Pending while elo_delta is null; DISPUTED is a mono tag at the end of the line, not a second badge."),
        ("First match and first win tags", card(media("fallback", "No film. Open match vs J. Cruz", a=("MR", "JC"), cap=C["L7"]), meta_row("J·C", "J. Cruz", "W", 16, "OCT 01", tags=(C["L3"], C["L4"]))),
         "Once the full history is loaded: the oldest match carries FIRST MATCH and the oldest win carries FIRST WIN (here one match is both)."),
    ]
    s = sheet_title("MatchFeedCard states",
                    "Media 16:9 at screen width minus 32, then the meta row. One status badge, top left, by the deck priority (deriveCardStatus, statusBadgeLabel, top to bottom below). Media tap plays the selected video (33) when it is playable, else opens match detail (32); the meta row always opens match detail. Processing is never a card badge.")
    for cap_, html, n in S:
        s += caption(cap_) + f'<div style="padding: 0 16px">{html}</div>'
        if n:
            s += note(n)
    s += caption("Shipped fallback without a phase read")
    s += f'<div style="padding: 0 16px">{card(media("landscape", "Play match vs S. Whitfield", ("ANALYZING 3/7", "amber"), "5:31"), meta_row("S·W", "S. Whitfield", "L", -9, "SEP 20"))}</div>'
    s += note("ANALYZING n/m is what statusBadgeLabel returns when the phase read is missing (older matches outside the 48 h phases window). Carried as shipped.")
    return sheet(s)


# ---------- 04 loading, filter, offline, error ----------
@board("P-MT-04-Matches-Loading-Errors.dc.html", "Proposed: Matches tab, loading, filter with no results, offline, errors")
def b04():
    sk = lambda w, h, r=2, extra="": f'<div style="width: {w}; height: {h}px; border-radius: {r}px; background: {BRIGHT}; flex-shrink: 0{"; " + extra if extra else ""}"></div>'
    skel_card = (col(sk(f"{MW}px", MH, 3) + row(sk("24px", 24) + col(sk("50%", 10) + sk("35%", 9), 7, "flex: 1"), 10, "flex-start", extra="padding-top: 12px"), 0))
    skel = (tab_header(C["M1"], inset=False) + frame_body(
        f'<div aria-label="Loading your matches" style="display: flex; flex-direction: column; gap: 16px">'
        + sk("55%", 11) + sk("90px", 20) + carousel([tile_slot(t_skeleton("matches"), "matches") for _ in range(4)])
        + skel_card + skel_card + skel_card + '</div>'))
    filt = (tab_header(C["M1"], inset=False) + frame_body(record_strip("21 MATCHES · 14W 6L 1D · 1487") + lane(C["M2"], m_lane()) + chips("Draws")
                                                            + panel(C["F2t"], C["F2b"], C["F2a"], M_HREF)))
    filt1 = (tab_header(C["M1"], inset=False) + frame_body(chips("Draws") + panel(C["F1t"], C["F1b"], C["F1a"], M_HREF)))
    err = (tab_header(C["M1"], inset=False) + frame_body(panel(C["E1t"], C["E1b"], C["E1a"], M_HREF)))
    off = (tab_header(C["M1"], inset=False) + offline_banner() + frame_body(panel(C["E1t"], C["E1b"], C["E1a"], M_HREF)))
    cached = (tab_header(C["M1"], inset=False) + frame_body(record_strip("21 MATCHES · 14W 6L 1D · 1487") + lane(C["M2"], m_lane()) + chips("All")
                                                             + month_header("OCTOBER 2026", "4 MATCHES") + c_okafor())
              + f'<div style="position: absolute; left: 16px; right: 16px; top: 66px">{toast(C["E2"])}</div>')
    more = (tab_header(C["M1"], inset=False) + frame_body(c_whitfield_disputed()
            + f'<button type="button" aria-label="Try again: load more matches" style="margin: 0; border: 0; background: transparent; padding: 24px 0; min-height: 44px; cursor: pointer; display: flex; justify-content: center">{mono(C["E3"], 10, INK2, 700)}</button>'))
    s = sheet_title("Matches: loading, filters, offline, errors",
                    "Carried Film Room panels and strings (film-room-states.tsx). Filters touch the feed only; the Your highlights carousel stays above them.")
    s += caption("Loading, nothing cached (shared skeleton shimmer, resting frame)") + frame(skel)
    s += note("Record strip placeholder, lane title, 4 tile skeletons and 3 feed card skeletons (16:9 block plus two meta lines). Bars are plate-bright with the 8% ink shimmer band; under Reduce Motion they rest.")
    s += caption("Filter with no results (C-F2), carousel unaffected") + frame(filt)
    s += caption("Filter with no results, older pages not loaded (C-F1)") + frame(filt1)
    s += caption("Error, nothing cached (C-E1)") + frame(err)
    s += caption("Offline, nothing cached: shipped offline banner plus C-E1") + frame(off)
    s += note("Offline with a cached page renders the cached feed under the banner; a poster that never downloaded shows the fallback art. Home hides its lane instead of showing an error (spec 10.4).")
    s += caption("Error with cached content: content stays, toast C-E2") + frame(cached)
    s += caption("Load more failed: carried ListFooter (C-E3)") + frame(more)
    return sheet(s)


# ---------- Home pieces ----------
def elo_tile(elo="1487", rec="14W · 6L · 1D", aria="Record: 14 wins, 6 losses, 1 draw"):
    return (f'<div style="flex-shrink: 0; position: relative; overflow: hidden; background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px 17.5px; display: flex; flex-direction: column; align-items: center">'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 96px; line-height: 105.6px; letter-spacing: -3.84px; color: {INK}; font-variant-numeric: tabular-nums">{elo}</span>'
            f'<span aria-label="{aria}" style="font-family: {MONO}; font-weight: 700; font-size: 14px; line-height: 18px; letter-spacing: 1.12px; margin: 4px 0; color: {INK2}; text-transform: uppercase; font-variant-numeric: tabular-nums">{q(rec)}</span>'
            f'<span aria-hidden="true" style="position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: {RED}"></span></div>')


def welcome(name="Marcus Reyes", tag="Welcome back"):
    return (f'<div style="flex-shrink: 0; display: flex; flex-direction: column">{label_tag(tag)}'
            f'<h1 style="margin: 7px 0 0; font-family: {DM}; font-weight: 700; font-size: 26px; line-height: 31px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{q(name)}</h1></div>')


ACT = [("Sam Whitfield", "defeated", "Jordan Cruz", True, "Today"), ("Leo Tanaka", "drew with", "Priya Shah", False, "Yesterday"),
       ("Marcus Reyes", "defeated", "Dana Okafor", True, "2d ago"), ("Leo Tanaka", "defeated", "Jordan Cruz", True, "5d ago")]


def activity(n=3, me=None):
    """RecentActivitySection with its All / Me toggle (kept in phase 1, owner 2026-10-06)."""
    rows = ""
    for i, (a, v, b, sub, when) in enumerate(ACT[:n]):
        sep = f'<div style="height: 1px; background: {HLF}"></div>' if i else ""
        tail = f' by <span style="font-family: {MONO}; font-weight: 500; color: {INK}">submission</span>' if sub else ""
        rows += (sep + f'<div style="padding: 10.5px 14px; display: flex; flex-direction: column; gap: 3.5px"><p style="margin: 0; font-family: {INTER}; font-weight: 400; font-size: 13px; line-height: 17px; color: {INK}">'
                 f'<span style="font-family: {DM}; font-weight: 500; color: {INK}">{a}</span> {v} <span style="font-family: {DM}; font-weight: 500; color: {INK}">{b}</span>{tail}</p>'
                 f'<span style="font-family: {MONO}; font-weight: 400; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{when}</span></div>')
    tog = ""
    for lab, on in (("All", True), ("Me", False)):
        tog += (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="margin: 0; cursor: pointer; display: inline-flex; align-items: center; align-self: flex-start; padding: 7px 10.5px; '
                f'border: 1px solid {HLS}; border-radius: 2px; background: {BRIGHT if on else PLATE}"><span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; '
                f'text-transform: uppercase; letter-spacing: 1.12px; color: {INK if on else INK2}">{lab}</span></button>')
    return (f'<section style="flex-shrink: 0; display: flex; flex-direction: column; gap: 10.5px">{label_tag("Recent Activity")}'
            f'<div style="display: flex; gap: 7px">{tog}</div><div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; overflow: hidden">{rows}</div></section>')


def resume_card():
    """ResumeMatchCard, as board 11."""
    return (f'<div style="flex-shrink: 0; background: {PLATE}; border: 1px solid {HL}; border-left: 3px solid {RED}; border-radius: 4px; padding: 14px; display: flex; flex-direction: column">'
            f'<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px">'
            f'<h2 style="margin: 0; flex: 1; font-family: {DM}; font-weight: 700; font-size: 18px; line-height: 22px; color: {INK}">Match in progress</h2>{label_tag("In progress")}</div>'
            f'<p style="margin: 0 0 10.5px">{body("vs Leo Tanaka. Pick up where you left off.", 13, INK2)}</p>'
            f'{btn_primary("Resume match →", "24-Live-Broadcast.dc.html", "Resume your match")}</div>')


def practice_card():
    """PracticeOfferCard (shipped copy, lib/practice/constants.ts). Holds Home's one red CTA."""
    return (f'<div style="flex-shrink: 0; background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 14px; display: flex; flex-direction: column">'
            f'<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px">'
            f'<h2 style="margin: 0; flex: 1; font-family: {DM}; font-weight: 700; font-size: 18px; line-height: 22px; color: {INK}">Try a practice match</h2>{label_tag("Practice")}</div>'
            f'<p style="margin: 0 0 10.5px">{body("Walk through a real Arena match against a practice bot. No rating, nobody else sees it, about a minute.", 13, INK2)}</p>'
            f'{btn_primary("Start practice", "41-Practice.dc.html", "Start practice")}<div style="height: 7px"></div>{btn_ghost("Not now")}</div>')


def home_lane_default(first_pulse=True):
    return lane(C["HM1"], m_lane("home", first_pulse))


HOME_PAD = "24px 16px 66px"


# ---------- 05 Home default ----------
@board("P-MT-05-Home-Default.dc.html", "Proposed: Home, Your reels lane first (phase 1, replaces the NEW HIGHLIGHT card)")
def b05():
    m = home_lane_default() + welcome() + elo_tile() + activity(4)
    return screen(tab_header(None, bell_badge=True), m, "home", main_pad=HOME_PAD, gap=20)


# ---------- 06 Home with resume ----------
@board("P-MT-06-Home-Resume.dc.html", "Proposed: Home with a lost live match (Resume above Your reels)")
def b06():
    m = resume_card() + home_lane_default(False) + welcome() + elo_tile() + activity(3)
    return screen(tab_header(None, bell_badge=True), m, "home", main_pad=HOME_PAD, gap=20)


# ---------- 07 Home future lanes ----------
def future_lane(title, gate, tiles_html):
    return (f'<section style="flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; border: 1px dashed {HLS}; border-radius: 4px; padding: 12px">'
            f'{row(label_tag(title) + future_chip(), 8, "center", "space-between", "flex-wrap: wrap")}'
            f'<div style="opacity: 0.38; display: flex; flex-direction: row; gap: 0; overflow: hidden; margin: 0 -12px 0 -4px" aria-hidden="true">{tiles_html}</div>'
            f'{row(ic("lock", 12, INK3) + mono(gate, 10, INK2, 500, 1.12, False, "white-space: normal"), 6, "flex-start")}</section>')


def follow_card(init, name, elo):
    return (f'<div style="flex-shrink: 0; width: 112px; box-sizing: border-box; margin: 0 4px; background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 6px">'
            f'{athlete_tile(init, 40, 13)}{heading(name, 12, INK)}{mono(elo, 11, INK, 700, 0.56, False)}'
            f'<span style="align-self: stretch; height: 32px; box-sizing: border-box; border: 1px solid {HLS}; border-radius: 3px; display: flex; align-items: center; justify-content: center; '
            f'font-family: {DM}; font-weight: 700; font-size: 11px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}">Follow</span></div>')


@board("P-MT-07-Home-Future-Lanes.dc.html", "Proposed: Home, future lanes (annotated, gated, not in phase 1)")
def b07():
    rt = lambda d, n: tile_slot(t_ready("home", d), "home", n)
    m = (home_lane_default(False)
         + f'<div style="flex-shrink: 0; padding: 10px 12px; border-left: 3px solid {HLS}; background: {PANEL}">{mono("Annotation: future lanes stack under Your reels, one ReelCarousel each, when their gates clear. None ships in phase 1.", 10, INK2, 700, 1.12, False, "white-space: normal")}</div>'
         + future_lane("Elo reels", "Gate: Terms v2 live (jr_be-dd4.5) and a spec 016 amendment for in-app reads. Epic jr_be-o7c.", rt("31s", "vs R. Alves") + rt("26s", "vs K. Ito") + rt("40s", "vs T. Moss"))
         + future_lane("Friend reels", "Gate: footage consent decision jr_be-17f (every clip shows two athletes). Epic jr_be-tjx.", rt("28s", "Sam W.") + rt("19s", "Leo T.") + rt("33s", "Priya S."))
         + future_lane("Athletes you might follow", "Gate: a follows table, RLS and a suggestions RPC, after jr_be-17f. Epic jr_be-293.", follow_card("RA", "R. Alves", "1512") + follow_card("KI", "K. Ito", "1478") + follow_card("TM", "T. Moss", "1495"))
         + welcome() + elo_tile() + activity(2))
    return screen(tab_header(None, bell_badge=True), m, "home", main_pad="24px 16px 40px", gap=20)


# ---------- 08 reel viewer ----------
def viewer_page(scale=1.0, hint=True, label="28s · Version 1", playing=True, close_href=HOME_HREF):
    """Today's ViewerScreen body (board 34) as one full-screen pager page."""
    fr = ("HIGHLIGHT REEL 9:16, PLAYING" if playing else "POSTER FRAME, PAUSED")
    h = (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10.5px; padding: 0 14px; min-height: 44px; flex-shrink: 0">'
         f'<a href="{close_href}" aria-label="Close" style="width: 44px; height: 44px; margin-left: -11px; display: flex; align-items: center; justify-content: center; color: {INK}">{ic("x", 22, INK)}</a>'
         f'<h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}">Your highlight</h1></div>')
    hint_ = (f'<div style="display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 4px">{ic("chev_u", 16, INK3)}'
             f'{mono("Swipe up for the next one", 10, INK3, 700)}</div>') if hint else ""
    return (f'<div style="width: 390px; height: 844px; box-sizing: border-box; background: {VOID}; display: flex; flex-direction: column; overflow: hidden; position: relative; padding-top: 47px; padding-bottom: 30px; flex-shrink: 0">'
            f'{h}<div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10.5px">'
            f'<div style="flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center">'
            f'<button aria-label="Your highlight vs D. Okafor, 28 seconds" style="align-self: center; width: 297px; height: 528px; border: 0; padding: 0; border-radius: 4px; background: {BRIGHT}; cursor: pointer; '
            f'font-family: {MONO}; font-weight: 500; font-size: 10px; letter-spacing: 2px; color: {PH}">{fr}</button></div>'
            f'<div style="display: flex; flex-direction: column; gap: 10.5px; padding: 0 14px">'
            f'<div style="font-family: {MONO}; font-weight: 400; font-size: 12px; line-height: 16px; color: {INK3}; font-variant-numeric: tabular-nums">{label}</div>'
            f'<div style="display: flex; flex-direction: column; gap: 7px">'
            f'{btn_primary("Share to Instagram", "35-Highlight-Share.dc.html")}{btn_secondary("Save to Photos")}{btn_secondary("Improve this reel")}</div></div>{hint_}</div></div>')


def mini_page(lab, state, on=False):
    return (f'<div style="width: 120px; height: 213px; box-sizing: border-box; border: 1px solid {INK if on else HL}; border-radius: 4px; background: {BRIGHT if on else PLATE}; '
            f'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; opacity: {1 if on else 0.7}">'
            f'{heading(lab, 12, INK)}{mono(state, 9, INK2 if on else INK3, 700, 1.12, True, "white-space: normal; text-align: center; padding: 0 6px")}</div>')


@board("P-MT-08-Reel-Viewer.dc.html", "Proposed: Reel viewer, vertical swipe pager (wraps board 34)")
def b08():
    s = sheet_title("Reel viewer: vertical swipe pager",
                    "A carousel tap opens the viewer at that reel (source home or matches, with a lane token). Each page is today's ViewerScreen (board 34) for one reel; swipe up for the next reel of the lane, down for the previous. Close and the system back gesture return to the surface that opened it; a swipe never closes.")
    s += caption("Page 2 of the lane, playing (first open shows the swipe hint once)") + viewer_page()
    s += note("C-V1 swipe hint (spec 8, AC 4.6): one mono ink-3 hint under the actions, shown once per install and only when the lane has 2 or more pages; gone after the first swipe. Pages reuse today's viewer layout (spec 8); a full-bleed shorts page would be a separate decision. Nothing else changes on the page: Share to Instagram keeps the red CTA and the share flow of 35.")
    s += caption("Pager model")
    s += (f'<div style="padding: 0 16px; display: flex; flex-direction: row; gap: 12px; align-items: center">'
          f'{col(mini_page("vs P. Shah", "Previous, paused on poster") + mini_page("vs D. Okafor", "Visible, playing", True) + mini_page("vs S. Whitfield", "Next, paused on poster"), 8)}'
          f'{bullets(["Vertical FlatList, pagingEnabled, windowSize 3: at most the visible page and its neighbours are mounted; one expo-video player plays.", "A page counts as visible at 80% (onViewableItemsChanged).", "Building and ghost tiles are not pages. Nearing the end loads the next page with the B1 cursor.", "Opened from push, the bell, match detail or the summary (no lane token): one reel, no swipe, exactly as today.", "Share sheet, improve sheet and any modal suspend paging while open.", "viewer_opened once per reel per pager session (swiped: true when reached by swipe); viewer_swiped per landing."], 12)}</div>')
    s += note("Watching marks the reel seen: its ring clears on return and the bell dot clears (notifyHighlightsChanged). Mute rule as today: starts with sound unless the viewer muted last time.")
    return sheet(s)


# ---------- 09 Profile cleaned (rebuilt from the live 17-Profile board) ----------
def _children(html):
    """Top-level element spans inside an element's inner html (balanced, non-void tags)."""
    void = {"br", "img", "input", "meta", "link", "hr"}
    spans, depth, start = [], 0, None
    for m_ in re.finditer(r"<(/?)([a-zA-Z0-9]+)([^>]*?)(/?)>", html):
        close, tag, _, selfc = m_.group(1), m_.group(2).lower(), m_.group(3), m_.group(4)
        if tag in void or selfc:
            continue
        if not close:
            if depth == 0:
                start = m_.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                spans.append(html[start:m_.end()])
    return spans


def profile_parts():
    src = open(os.path.join(SRC, "17-Profile.dc.html")).read()
    header = re.search(r"<header.*?</header>", src, re.S).group(0)
    mm = re.search(r'(<main[^>]*>)(.*?)</main>', src, re.S)
    kids = _children(mm.group(2))
    want = [("Marcus Reyes", True), ("Share profile", True), ("Friends", True), ("Win Rate", True), ("Recent Matches", False),
            ("Highlights", False), ("Film Room", False), ("View Detailed Stats", True), ("Account", True), ("ELO RATED Beta", True)]
    assert len(kids) == len(want), f"17-Profile main has {len(kids)} children, expected {len(want)}"
    keep = []
    for k, (marker, ok) in zip(kids, want):
        assert marker in k, f"17-Profile child order changed: {marker!r} not where expected"
        if ok:
            keep.append(k)
    return header, mm.group(1), keep


@board("P-MT-09-Profile-Clean.dc.html", "Proposed: Profile, identity, stats and settings only (no Recent Matches, highlights or Film Room)")
def b09():
    header, main_open, keep = profile_parts()
    header = header.replace("17-Profile.dc.html", PROFILE_HREF)
    return header + main_open.replace("padding: 24px 16px 0", "padding: 24px 16px 40px") + "".join(keep) + "</main>" + tab_bar("profile")


# ---------- 10 zero, Matches ----------
NEW_NAME = "Ana Lima"


def zero_matches_main(clips=True):
    ghost_tiles = [tile_slot(t_ghost("matches", C["Z2"]), "matches", aria=C["Z2"]),
                   tile_slot(t_ghost("matches", "", 0.55), "matches"), tile_slot(t_ghost("matches", "", 0.28), "matches")]
    prog = col(mono(C["Z3"], 10, INK2, 700, 1.68, True, "white-space: normal")
               + f'<div aria-hidden="true" style="height: 3px; background: {HLS}"><div style="width: 0; height: 3px; background: {INK}"></div></div>', 6, "flex-shrink: 0")
    out = ""
    if clips:
        out += lane(C["M2"], ghost_tiles)
    out += ghost_card(C["Z1"] if clips else C["Z2b"])
    if clips:
        out += prog
    out += btn_primary(C["Z4"], ARENA_HREF, "Find a match in the Arena. Opens the Arena tab")
    out += text_btn(C["Z5"], "41-Practice.dc.html", "Try a practice match", INK, center=True)
    out += helper_line(C["Z6"] if clips else C["L6"])
    return out


@board("P-MT-10-Zero-Matches.dc.html", "Proposed: Zero matches, Matches tab (first match hero)")
def b10():
    return screen(tab_header(C["M1"]), zero_matches_main(), "matches", gap=16)


# ---------- 11 zero, Home ----------
@board("P-MT-11-Zero-Home.dc.html", "Proposed: Zero matches, Home (CTA tile, never red; practice offer keeps the red)")
def b11():
    ln = lane(C["HM1"], [tile_slot(t_cta("home", C["HZ1"]), "home", href=ARENA_HREF, aria="Get your first highlight. Opens the Arena tab"),
                         tile_slot(t_ghost("home", C["Z2"]), "home", aria=C["Z2"])])
    m = ln + welcome(NEW_NAME, "Welcome") + elo_tile("1000", "0W · 0L · 0D", "Record: no matches yet") + practice_card() + activity(3)
    return screen(tab_header(None), m, "home", main_pad=HOME_PAD, gap=20)


# ---------- 12 low data, Matches ----------
@board("P-MT-12-Low-Data-Matches.dc.html", "Proposed: Low data, Matches tab (3 matches, no film, no highlights yet)")
def b12():
    tiles = [tile_slot(t_ghost("matches", C["L5"]), "matches", aria=C["L5"]),
             tile_slot(t_ghost("matches", "", 0.55), "matches"), tile_slot(t_ghost("matches", "", 0.28), "matches")]
    m = (record_strip("3 MATCHES · 2W 1L 0D · 1021")
         + lane(C["M2"], tiles, after=helper_line(C["L6"]))
         + chips("All")
         + month_header("OCTOBER 2026", "3 MATCHES")
         + card(media("fallback", "No film. Open match vs D. Okafor", a=("AL", "DO")), meta_row("D·O", "D. Okafor", "W", 14, "OCT 05"))
         + card(media("fallback", "No film. Open match vs L. Tanaka", a=("AL", "LT")), meta_row("L·T", "L. Tanaka", "W", 16, "OCT 03", tags=(C["L4"],)))
         + card(media("fallback", "No film. Open match vs J. Cruz", a=("AL", "JC")), meta_row("J·C", "J. Cruz", "L", -9, "OCT 01", tags=(C["L3"],)))
         + ghost_card(C["L1"], action=C["L2"]))
    return screen(tab_header(C["M1"]), m, "matches", gap=16)


# ---------- 13 low data, Home ----------
@board("P-MT-13-Low-Data-Home.dc.html", "Proposed: Low data, Home (matches but no reels yet)")
def b13():
    ln = lane(C["HM1"], [tile_slot(t_cta("home", C["L2"]), "home", href=ARENA_HREF, aria="Find a match. Opens the Arena tab"),
                         tile_slot(t_ghost("home", C["L5"]), "home", aria=C["L5"])],
              after=helper_line(C["L6"]))
    m = ln + welcome(NEW_NAME) + elo_tile("1021", "2W · 1L · 0D", "Record: 2 wins, 1 loss, 0 draws") + activity(3)
    return screen(tab_header(None), m, "home", main_pad=HOME_PAD, gap=20)


# ---------- 14 tiles and in-flight reveal ----------
@board("P-MT-14-Reel-Tiles-In-Flight.dc.html", "Proposed: Reel tile kinds and the in-flight reveal")
def b14():
    s = sheet_title("Reel tiles and the in-flight reveal",
                    "ReelTile kinds (spec 5), matches size 96 x 171 (Home 104 x 185). Every tile is at least 44 pt, has a label, and ready tiles say unwatched when unseen.")
    rows_ = [
        [tile_slot(t_ready("matches", "28s"), "matches", "vs D. Okafor", "Unseen", ring=True, aria="Watch your highlight vs D. Okafor, unwatched"),
         tile_slot(t_ready("matches", "21s"), "matches", "vs P. Shah", "Seen", aria="Watch your highlight vs P. Shah"),
         tile_slot(t_skeleton("matches"), "matches", None, "Skeleton")],
        [tile_slot(t_building("matches", 1), "matches", "vs L. Tanaka", C["B4"], aria="Building your highlight, step 1 of 2"),
         tile_slot(t_building("matches", 2), "matches", "vs L. Tanaka", C["B4"], aria="Building your highlight, step 2 of 2"),
         tile_slot(t_building("matches", wait="8:12"), "matches", "vs L. Tanaka", C["B4"], aria="Waiting 8 minutes 12 seconds for another angle")],
        [tile_slot(t_building("matches", wait="0:00"), "matches", "vs L. Tanaka", C["B4"], aria="Any second now"),
         tile_slot(t_ghost("matches", C["Z2"]), "matches", None, "Ghost", aria=C["Z2"]),
         tile_slot(t_ghost("matches", C["L5"]), "matches", None, "Ghost", aria=C["L5"])],
        [tile_slot(t_cta("matches", C["HZ1"]), "matches", None, "CTA, secondary", aria=C["HZ1"]),
         tile_slot(t_cta("matches", C["L2"]), "matches", None, "CTA, secondary", aria=C["L2"]),
         tile_slot(t_see_all("matches"), "matches", None, "See all (Home)", aria="See all, open Matches")],
    ]
    labels = ["Ready unseen, ready seen, skeleton", "Building: step 1 (planning or waiting), step 2 (rendering), waiting countdown",
              "Waiting at 0:00, ghost C-Z2, ghost C-L5", "CTA tiles and the See all tile"]
    for lab, r in zip(labels, rows_):
        s += caption(lab) + f'<div style="padding: 0 16px">{carousel(r)}</div>'
    s += note("Unseen ring: the unseen-ring alias, a 2 px ink stroke-edge with a 2 px surface gap (spec 5). Never signal-red: Home's one red CTA stays with Resume or the practice offer (AC 3.5). Building tiles show the match poster under a dark scrim with the shared shimmer band; the countdown is server-clock based (Oct 4 deck). Tapping a building tile opens match detail on its Film status plate (32), never the viewer. Ghost tiles are not pressable; CTA tiles switch to the Arena tab.")
    s += caption("Home lane loading: 3 skeleton tiles while the first read is in flight")
    s += f'<div style="padding: 0 16px">{lane(C["HM1"], [tile_slot(t_skeleton("home"), "home") for _ in range(3)])}</div>'
    s += note("Never a blank gap that pops (spec 10.4). If the read fails, the lane hides quietly; Home never shows an error for it.")
    s += caption("Reveal: the reel lands while Home is on screen")
    seq = [("Building, step 2", tile_slot(t_building("home", 2), "home", "vs D. Okafor", C["B4"])),
           ("Ready: cross-fade, ring, one pulse, success haptic", tile_slot(t_ready("home", "28s"), "home", "vs D. Okafor", ring=True, pulse=True, aria="Watch your highlight vs D. Okafor, unwatched")),
           ("At rest, unseen", tile_slot(t_ready("home", "28s"), "home", "vs D. Okafor", ring=True))]
    s += (f'<div style="padding: 0 16px; display: flex; flex-direction: row; gap: 6px; align-items: flex-start">'
          + "".join(col(t + mono(lab, 9, INK3, 700, 1.12, True, "white-space: normal"), 8, "width: 112px") for lab, t in seq) + '</div>')
    s += bullets(["Cross-fade building to ready (fast, 240 ms), then the ring pulses once: scale 1.0 to 1.04 and back, 600 ms, Reanimated, registered as moment.reelRingPulse (600 ms).",
                  "Haptics.notificationAsync(Success) once, with the pulse. Reduce Motion: no pulse and no shimmer; the ring and the haptic stay.",
                  "The first unseen tile on Home also pulses once per session the first time it appears (AC 3.2)."], 12, INK2, 16)
    return sheet(s)


# ---------- 15 milestones ----------
CONF = [(0.09, 6, 14, RED), (0.16, 8, 8, INK), (0.24, 5, 16, NEG), (0.33, 10, 5, INK), (0.42, 6, 12, RED), (0.51, 7, 7, INK), (0.6, 5, 14, RED),
        (0.68, 9, 5, NEG), (0.76, 6, 10, INK), (0.84, 5, 13, RED), (0.9, 7, 7, INK), (0.95, 5, 11, NEG), (0.2, 6, 6, INK), (0.72, 6, 9, RED)]


def confetti(origins, ink_only=False, seed=0, floor=60):
    """14 sharp rectangles bursting from the banner ends and the celebrated card or tile (spec 10.6).
    Verdict confetti colours (signal-red, ink, signal-red-text); ink only for a first match that was a
    loss. Pieces never rise above `floor` (the header chrome and wordmark stay clear)."""
    out = ""
    for i, (_, w, hh, c) in enumerate(CONF):
        ox, oy = origins[i % len(origins)]
        dx = ((i * 23 + seed * 11) % 46) - 14
        dx = dx if ox < 195 else -dx
        if 120 < ox < 270:
            dx = ((i * 19 + seed * 5) % 60) - 30
        dy = ((i * 31 + seed * 7) % 44) - 22
        x = min(384 - w, max(2, ox + dx))
        y = max(floor, oy + dy)
        col_ = INK if ink_only else c
        rot = ((i * 29 + seed * 7) % 90) - 45
        out += f'<span style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {hh}px; background: {col_}; transform: rotate({rot}deg)"></span>'
    return f'<div aria-hidden="true" style="position: absolute; inset: 0; pointer-events: none">{out}</div>'


def milestone_banner(text, rail=INK, icon="sparkles"):
    return (f'<div role="status" style="flex-shrink: 0; display: flex; flex-direction: row; align-items: center; gap: 10px; background: {PLATE}; border: 1px solid {HLS}; '
            f'border-left: 3px solid {rail}; border-radius: 4px; padding: 12px 14px; min-height: 44px; box-sizing: border-box">{ic(icon, 16, INK)}{heading(text, 14, INK)}</div>')


@board("P-MT-15-Milestones.dc.html", "Proposed: Milestones (first match, first win, first highlight)")
def b15():
    s = sheet_title("Milestones: first match, first win, first highlight",
                    "Each fires once per athlete per device, within 7 days of the event: a short confetti burst from the card or tile, a success haptic, and a one-line banner above it that fades after 4 s or on tap. Elo milestones are deferred (owner 2026-10-06).")
    f1 = (tab_header(C["M1"], inset=False) + frame_body(record_strip("1 MATCH · 0W 1L 0D · 991")
          + milestone_banner(C["C1"])
          + card(media("fallback", "No film. Open match vs J. Cruz", a=("AL", "JC")), meta_row("J·C", "J. Cruz", "L", -9, "OCT 01", tags=(C["L3"],)))))
    s += caption("First match (C-C1), Matches tab, on the first card") + frame(f1 + confetti([(14, 124), (376, 124), (14, 170), (376, 170)], ink_only=True, seed=1))
    s += note("This first match was a loss: the pieces are ink only (no red), and the haptic is withheld because the design system never fires a haptic on a loss (spec 10.6 loss exception).")
    f2 = (tab_header(C["M1"], inset=False) + frame_body(record_strip("2 MATCHES · 1W 1L 0D · 1007")
          + milestone_banner(C["C2"], GREEN, "trophy")
          + card(media("landscape", "Play match vs L. Tanaka", ("NEW", "light"), "5:02"), meta_row("L·T", "L. Tanaka", "W", 16, "OCT 03", tags=(C["L4"],)))))
    s += caption("First win (C-C2), Matches tab, on that card") + frame(f2 + confetti([(14, 124), (376, 124), (14, 170), (376, 170)], seed=2))
    s += note("The win rail is gain-green (a win). If one match is both the first match and the first win, only the First win banner shows; both tags (FIRST MATCH, FIRST WIN) remain on the card and both milestones are marked.")
    f3 = (tab_header(None, inset=False) + frame_body(milestone_banner(C["C3"])
          + lane(C["HM1"], [tile_slot(t_ready("home", "28s"), "home", "vs D. Okafor", ring=True, pulse=True, href=VIEWER_HREF, aria="Watch your first highlight vs D. Okafor, unwatched"),
                            tile_slot(t_ghost("home", C["L5"]), "home", aria=C["L5"])])
          + welcome(NEW_NAME), pad="24px 16px"))
    f3_note = "A lane with 1 to 2 ready reels appends one ghost tile (C-L5) so the shelf reads as filling (owner to confirm)."
    s += caption("First highlight (C-C3), Home lane (else the Matches carousel, whichever opens first)") + frame(f3 + confetti([(14, 102), (376, 102), (68, 160), (68, 240)], seed=3)) + note(f3_note)
    s += caption("Rules")
    s += bullets([
        "Stored in AsyncStorage milestones:v1:<athleteId>, written the moment the celebration starts. A milestone that fires on Home does not fire again on Matches.",
        "Never during an active Arena match or over a modal: it waits for the next focus of the surface.",
        "Confetti: 14 sharp rectangles in the verdict confetti colours (signal-red, ink, signal-red-text), under 1.2 s, no sound; a new Moment in the motion registry with its own moment durations.",
        "Reduce Motion: no particles and no pulse; the banner and the haptic still show.",
        "The banner is a status: VoiceOver reads its line once. Tapping it dismisses it.",
        "Each celebration logs matches.milestone_shown with its milestone tag.",
    ], 12, INK2, 16)
    return sheet(s)


# ---------- 16 clips off ----------
@board("P-MT-16-Clips-Off.dc.html", "Proposed: Highlights flag off (both carousels hidden)")
def b16():
    s = sheet_title("Highlights off (clips_enabled false)",
                    "Both carousels are hidden, never shown empty, and no copy promises a highlight (spec 10.7). Everything else stays.")
    home = tab_header(None, inset=False) + frame_body(welcome() + elo_tile() + activity(2), pad="24px 16px")
    s += caption("Home: no lane, Welcome is first again") + frame(home)
    mt = tab_header(C["M1"], inset=False) + frame_body(record_strip("21 MATCHES · 14W 6L 1D · 1487") + chips("All") + month_header("OCTOBER 2026", "4 MATCHES") + c_okafor())
    s += caption("Matches with history: no Your highlights row") + frame(mt)
    s += note("The card badge BUILDING HIGHLIGHT should not occur with clips off (no reel is planned), so cards read New, Breakdown ready or No film as usual.")
    zt = tab_header(C["M1"], inset=False) + frame_body(zero_matches_main(clips=False))
    s += caption("Matches, zero matches: C-Z2b, no progress line, film helper") + frame(zt)
    s += note("C-Z6 mentions a highlight, so with clips off the helper falls back to C-L6 (Turn on Record from my phone at face-off.). Spec 10.7: C-L6 replaces C-Z6 with clips off.")
    return sheet(s)


# ---------- 00 map ----------
def map_card(title, inner, w=None):
    ww = f"width: {w}px; " if w else "flex: 1 1 0; "
    return (f'<section style="{ww}min-width: 0; box-sizing: border-box; background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 18px; display: flex; flex-direction: column; gap: 10px">'
            f'{mono(title, 10, INK3, 700, 2.52)}{inner}</section>')


MAP_BOARDS = [
    ("P-MT-01-Tab-Bar.dc.html", "01", "Tab bar: 5 tabs, Film icon, 375 check, no Matches badge"),
    ("P-MT-02-Matches-Default.dc.html", "02", "Matches tab: record strip, Your highlights, chips, feed"),
    ("P-MT-03-Card-States.dc.html", "03", "MatchFeedCard: badge priority, crop rule, tags"),
    ("P-MT-04-Matches-Loading-Errors.dc.html", "04", "Loading, filter empty, offline, errors"),
    ("P-MT-05-Home-Default.dc.html", "05", "Home: Your reels lane first"),
    ("P-MT-06-Home-Resume.dc.html", "06", "Home: Resume above Your reels"),
    ("P-MT-07-Home-Future-Lanes.dc.html", "07", "Home: future lanes and their gates"),
    ("P-MT-08-Reel-Viewer.dc.html", "08", "Reel viewer: vertical swipe pager"),
    ("P-MT-09-Profile-Clean.dc.html", "09", "Profile: identity, stats, settings"),
    ("P-MT-10-Zero-Matches.dc.html", "10", "Zero matches: Matches tab"),
    ("P-MT-11-Zero-Home.dc.html", "11", "Zero matches: Home"),
    ("P-MT-12-Low-Data-Matches.dc.html", "12", "Low data: Matches tab"),
    ("P-MT-13-Low-Data-Home.dc.html", "13", "Low data: Home"),
    ("P-MT-14-Reel-Tiles-In-Flight.dc.html", "14", "Tile kinds and the in-flight reveal"),
    ("P-MT-15-Milestones.dc.html", "15", "Milestones: first match, win, highlight"),
    ("P-MT-16-Clips-Off.dc.html", "16", "Highlights flag off"),
]


@board("P-MT-00-Map.dc.html", "Proposed: Matches tab map (what changed, decisions, lanes and gates, open questions)", w=1440)
def b00():
    changed = bullets([
        "A fifth tab, Matches (lucide Film): Home · Arena · Matches · Rankings · Profile. No badge on it.",
        "Matches is the athlete's own history and replaces the pushed Film Room screen (31), which becomes a redirect for two OTAs.",
        "Matches, top to bottom: TabHeader, record strip, Your highlights carousel (9:16 tiles), the shipped filter chips and Opponent picker, month headers, full-width 16:9 match cards. Matches with no film are listed.",
        "Card media tap plays the selected video (33) when playable; the meta row opens match detail (32).",
        "Home: Resume (only for a lost live match), then the Your reels lane, then Welcome, Elo tile, practice offer, invite card and Recent Activity with its All / Me toggle. The lane absorbs the NEW HIGHLIGHT card (no dismiss).",
        "Carousel tap opens a vertical swipe pager over today's viewer (34).",
        "Profile loses Recent Matches, the Highlights row and the Film Room preview, and gets no View all matches link.",
        "Zero, low-data and in-flight states sell the next action; three one-time milestones celebrate firsts.",
    ], 13)
    decisions = bullets([
        "Lane titles: Your highlights on Matches (C-M2), Your reels on Home (C-HM1), as the spec copy table.",
        "Unseen ring: 2 px ink stroke-edge with a 2 px gap. The design system has no highlight accent token; ink is the state edge colour (README).",
        "Crop rule: portrait stills pillarboxed (contain over a blurred cover copy, 40% void scrim); landscape and square fill (cover).",
        "One status badge per card, top left, by the deck priority; DISPUTED and Pending live in the meta line.",
        "Meta row: 24 pt avatar, vs name, outcome letter, delta, short date, plus FIRST MATCH / FIRST WIN tags; a chevron marks it as its own target.",
        "Red: Matches zero state owns its one red CTA (Find a match in the Arena). Home tiles are never red.",
        "Clips off hides both carousels and every highlight promise.",
        "Elo milestones deferred (owner, 2026-10-06).",
    ], 13)
    future = ("".join(
        f'<div style="display: flex; flex-direction: row; gap: 12px; padding: 10px 0; border-top: 1px solid {HLF}">'
        f'<div style="width: 190px; flex-shrink: 0">{heading(n, 14, INK)}</div><div style="flex: 1">{body(g, 13, INK2)}</div></div>'
        for n, g in [("Your reels (phase 1)", "Own highlights only, from get_my_highlights. Ships with the tab."),
                     ("Elo reels", "Gated on Terms v2 (jr_be-dd4.5) and a spec 016 amendment. Epic jr_be-o7c."),
                     ("Friend reels", "Gated on the footage consent decision jr_be-17f. Epic jr_be-tjx."),
                     ("Athletes you might follow", "Needs a follows table, RLS and a suggestions RPC; after jr_be-17f. Epic jr_be-293."),
                     ("Matches visibility filter", "Me / Friends / Gym / World on the Matches tab; same visibility model. Epic jr_be-7t0.")]))
    links = "".join(
        f'<a href="{f}" style="display: flex; flex-direction: row; gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid {HLF}; color: {INK}">'
        f'{mono(n, 11, INK, 700, 0.56, False)}{body(t, 13, INK)}<span style="flex: 1"></span>{ic("chev_r", 14, INK3)}</a>' for f, n, t in MAP_BOARDS)
    asks = bullets([
        "B1 jr_be-405 (required): get_my_highlights keyset tiebreak p_before_id, next_before / next_before_id.",
        "B2 jr_be-cl1: in_flight array on the first page (Home building tiles).",
        "B3 jr_be-pdf: is_primary per video in get_my_match_library.",
        "B4 jr_be-62n: funnel steps matches_reel_tapped and viewer_swiped.",
    ], 12)
    openq = (bullets([
        "Spec Q5: remove the Film Room redirect after two OTAs.",
        "Spec Q6: full-bleed shorts pager pages (later; phase 1 reuses today's viewer, spec 8).",
        "Spec Q7: a lane with 1 to 2 ready reels appends one ghost tile.",
        "Spec Q3: no Matches tab badge in phase 1.",
    ], 12) + mono("Decided in design review 2026-10-06 (owner may override)", 10, INK3, 700, 1.68, True, "white-space: normal; margin-top: 6px") + bullets([
        "Loss haptic: none on a first match that was a loss (spec 10.6).",
        "First match and first win in one match: only the First win banner (spec 10.6).",
        "Swipe hint C-V1, once per install, 2+ pages (spec 8, AC 4.6).",
        "Clips off: C-L6 replaces C-Z6 (spec 10.7).",
        "Record strip: the shipped recordStrip format (spec 6.1).",
        "Unseen ring: alias unseen-ring = ink stroke-edge (spec 5).",
        "Meta-row chevron: decoration inside the meta target (spec 6.2).",
    ], 12))
    status = (f'<div style="display: flex; flex-direction: row; gap: 12px; align-items: center">{badge("Proposed, for owner review", "amber")}'
              f'{mono("Reviewed 2026-10-06 · Spec specs/matches-tab/spec.md · Epic jits-a4fw", 10, INK3, 500)}</div>')
    top = (f'<div style="padding: 40px 48px 0; display: flex; flex-direction: column; gap: 10px">{status}'
           f'{heading("Matches tab: map", 32, INK, tag="h1")}'
           f'<p style="margin: 0; max-width: 1000px">{body("Boards for the owner-approved Matches tab and Home reel carousel (phase 1): a fifth tab for your own match history, a leaner Profile, a Home that opens on your reels, a swipeable viewer, and empty states that pull you into your next match.", 15, INK2)}</p></div>')
    grid = (f'<div style="padding: 24px 48px 48px; display: flex; flex-direction: column; gap: 20px">'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("What changed", changed)}{map_card("Design decisions", decisions)}</div>'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("Boards", links, 560)}{map_card("Lanes and their gates", future)}</div>'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("Backend (jr_be, applied before the OTA)", asks)}{map_card("Open questions", openq)}'
            f'{map_card("Retired by this page", bullets(["31 Film Room as a pushed screen (redirect to Matches for two OTAs).", "17 Profile: Recent Matches, Highlights row, Film Room preview.", "11 Home: NEW HIGHLIGHT card and its dismiss."], 12))}</div></div>')
    return top + grid


# ---------------- write ----------------
def page(title, w, h, inner):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title.replace("&", "&amp;").replace("<", "&lt;")}</title>
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
<div style="width: {w}px; height: {h}px; box-sizing: border-box; background: {VOID}; color: {INK}; display: flex; flex-direction: column; overflow: hidden; position: relative">
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


PAGE_ID, PAGE_NAME = "matches-tab", "Proposed (Oct 6 Matches tab)"
ROW1 = ["P-MT-01-Tab-Bar.dc.html", "P-MT-02-Matches-Default.dc.html", "P-MT-03-Card-States.dc.html", "P-MT-04-Matches-Loading-Errors.dc.html",
        "P-MT-05-Home-Default.dc.html", "P-MT-06-Home-Resume.dc.html", "P-MT-07-Home-Future-Lanes.dc.html", "P-MT-08-Reel-Viewer.dc.html",
        "P-MT-09-Profile-Clean.dc.html"]
ROW2 = ["P-MT-10-Zero-Matches.dc.html", "P-MT-11-Zero-Home.dc.html", "P-MT-12-Low-Data-Matches.dc.html", "P-MT-13-Low-Data-Home.dc.html",
        "P-MT-14-Reel-Tiles-In-Flight.dc.html", "P-MT-15-Milestones.dc.html", "P-MT-16-Clips-Off.dc.html"]


def write_delta(written):
    info = {f: (t, w, h) for f, t, w, h in written}
    boards, notes = {}, {}
    map_h = info["P-MT-00-Map.dc.html"][2]
    boards["P-MT-00-Map.dc.html"] = {"h": map_h, "is_interactive": True, "page": PAGE_ID, "title": info["P-MT-00-Map.dc.html"][0], "w": 1440, "x": 0, "y": 0}
    notes["mt-row-0"] = {"kind": "title1", "maxW": 1440, "page": PAGE_ID, "text": "Oct 6 Matches tab: map", "w": 240, "x": 0, "y": -280}
    y1 = map_h + 343
    notes["mt-row-1"] = {"kind": "title1", "maxW": 470 * len(ROW1) - 80, "page": PAGE_ID, "text": "Tab bar, Matches tab, Home, reel viewer, Profile", "w": 240, "x": 0, "y": y1 - 280}
    for i, f in enumerate(ROW1):
        t, w, h = info[f]
        boards[f] = {"h": h, "is_interactive": True, "page": PAGE_ID, "title": t, "w": w, "x": 470 * i, "y": y1}
    y2 = y1 + max(info[f][2] for f in ROW1) + 343
    notes["mt-row-2"] = {"kind": "title1", "maxW": 470 * len(ROW2) - 80, "page": PAGE_ID, "text": "Zero, low data, in-flight, milestones and highlights off", "w": 240, "x": 0, "y": y2 - 280}
    for i, f in enumerate(ROW2):
        t, w, h = info[f]
        boards[f] = {"h": h, "is_interactive": True, "page": PAGE_ID, "title": t, "w": w, "x": 470 * i, "y": y2}
    delta_ = {
        "pages_append": [{"id": PAGE_ID, "name": PAGE_NAME}],
        "boards_add": boards,
        "notes_add": notes,
        "order_append": ["P-MT-00-Map.dc.html"] + ROW1 + ROW2,
        "based_on_canvas_version": CANVAS_VERSION,
        "note": "Additive only: no existing board, note, page or key changes. Re-read project/canvas.json right before publishing and merge these keys into the fresh copy.",
    }
    json.dump(delta_, open(os.path.join(HERE, "canvas-delta.json"), "w"), indent=1, ensure_ascii=False)


def main():
    files = [b[0] for b in BOARDS]
    assert sorted(files) == sorted(["P-MT-00-Map.dc.html"] + ROW1 + ROW2), "board list and rows disagree"
    # Drop stale board files from earlier drafts so project/ holds exactly this page.
    for old in os.listdir(OUT):
        if old.startswith("P-MT-") and old not in files:
            os.remove(os.path.join(OUT, old))
    written = []
    for file, title, w, fn in BOARDS:
        inner = fn()
        h = HEIGHTS.get(file, 4000)
        html = page(title.replace("Proposed: ", ""), w, h, inner)
        assert "\u2014" not in html and "\u2013" not in html, f"dash in {file}"
        open(os.path.join(OUT, file), "w").write(html)
        written.append((file, title, w, h))
    json.dump([{"file": f, "title": t, "w": w, "h": h} for f, t, w, h in written], open(os.path.join(HERE, "boards.json"), "w"), indent=2)
    write_delta(written)
    print("\n".join(f"{f} {w}x{h}" for f, t, w, h in written))


if __name__ == "__main__":
    main()
