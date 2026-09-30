#!/usr/bin/env python3
"""Generates artboards 41-48 (Practice, Notifications panel, Settings family, System overlays)."""
import os

OUT = os.environ.get("NATIVE_SCREENS_OUT", os.path.join(os.getcwd(), "project"))

# ---- tokens (lib/tokens.ts darkTokens) ------------------------------------
SURF = "#0D0F14"; S2 = "#13151B"; S3 = "#1E222B"; S4 = "#262A34"
INK = "#E8EDF2"; INK2 = "#9CA3AF"; INK3 = "#8D929D"; ON_CTA = "#0D0F14"
CTA = "#E63946"; CTA_TEXT = "#EC6A74"; POS = "#22C55E"
HAIR = "rgba(107,114,128,.45)"; FAINT = "rgba(107,114,128,.20)"; STRONG = "rgba(107,114,128,.62)"
# legacy shadcn dark tokens (hsl resolved): destructive / destructive-foreground / foreground / background / muted / primary
DESTRUCTIVE = "#E63746"; FG = "#E8EDF2"; BG = "#0C0E13"; MUTED = "#242833"; PRIMARY = "#E63746"

MONO = "'JetBrains Mono',monospace"; DM = "'DM Sans',sans-serif"; INTER = "'Inter',sans-serif"; BEBAS = "'Bebas Neue',sans-serif"
TAB = "font-variant-numeric: tabular-nums;"

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'

BTN_RESET = "margin: 0; font: inherit; background: none; border: none; padding: 0; cursor: pointer; text-align: inherit; color: inherit;"


def page(title, body, w=390, h=844):
    return f"""<!doctype html>
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
<div style="width: {w}px; height: {h}px; box-sizing: border-box; background: {SURF}; color: {INK}; display: flex; flex-direction: column; overflow: hidden; position: relative">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""


# ---- lucide icons ----------------------------------------------------------
ICONS = {
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>',
    "chevron-left": '<path d="m15 18-6-6 6-6"></path>',
    "house": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
    "swords": '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" x2="19" y1="19" y2="13"></line><line x1="16" x2="20" y1="16" y2="20"></line><line x1="19" x2="21" y1="21" y2="19"></line><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"></polyline><line x1="5" x2="9" y1="14" y2="18"></line><line x1="7" x2="4" y1="17" y2="20"></line><line x1="3" x2="5" y1="19" y2="21"></line>',
    "trophy": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    "bell": '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>',
    "clapperboard": '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"></path><path d="m6.2 5.3 3.1 3.9"></path><path d="m12.4 3.4 3.1 4"></path><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>',
    "check-circle": '<path d="M21.801 10A10 10 0 1 1 17 3.335"></path><path d="m9 11 3 3L22 4"></path>',
    "x-circle": '<circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path>',
    "zap": '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>',
    "wifi-off": '<path d="M12 20h.01"></path><path d="M8.5 16.429a5 5 0 0 1 7 0"></path><path d="M5 12.859a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.859a10 10 0 0 0-2.007-1.523"></path><path d="M2 8.82a15 15 0 0 1 4.177-2.643"></path><path d="M22 8.82a15 15 0 0 0-11.288-3.764"></path><path d="m2 2 20 20"></path>',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path>',
    "x": '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
}


def icon(name, size, color, sw=2):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
            f'style="color: {color}; display: block; flex-shrink: 0">{ICONS[name]}</svg>')


# ---- shared chrome ---------------------------------------------------------
def app_header(title, back_href):
    """components/layout/app-header.tsx: 56 + insets.top, surface-2, hairline bottom."""
    return f"""<header style="height: 103px; padding: 47px 16px 0 16px; box-sizing: border-box; background: {S2}; border-bottom: 1px solid {HAIR}; display: flex; flex-direction: row; align-items: center; flex-shrink: 0">
  <div style="flex: 1 1 0; height: 32px; display: flex; align-items: center">
    <a href="{back_href}" aria-label="Go back" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 2px">{icon("chevron-left", 20, INK2)}</a>
  </div>
  <div style="max-width: 50%; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 7px">
    <h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.68px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{title}</h1>
  </div>
  <div style="flex: 1 1 0; height: 32px; display: flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 7px"></div>
</header>"""


def brand_header(badge=None):  # mirrors Main.dc.html header
    """components/layout/brand-header.tsx + TabHeaderActions (status chip offline + bell)."""
    pill = ""
    if badge:
        pill = (f'<span style="position: absolute; top: 0; right: 0; min-width: 14px; min-height: 14px; box-sizing: border-box; '
                f'padding: 0 3.5px; border-radius: 2px; background: {CTA}; display: flex; align-items: center; justify-content: center; '
                f'font-family: {MONO}; font-weight: 700; font-size: 9px; line-height: 12px; color: {ON_CTA}">{badge}</span>')
    return f"""<header style="height: 103px; padding: 47px 14px 0 14px; box-sizing: border-box; background: {S2}; border-bottom: 1px solid {HAIR}; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0">
  <div style="flex-shrink: 0; font-family: {BEBAS}; font-size: 22px; line-height: 22px; letter-spacing: -0.07px; color: {INK}">ELO RATED</div>
  <div style="flex: 1 1 auto; display: flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 7px">
    <button type="button" aria-label="Live status: 5 on the mat. Go live" style="{BTN_RESET} height: 28px; box-sizing: border-box; border: 1px solid {INK3}; border-radius: 2px; padding: 0 8px; display: flex; flex-direction: row; align-items: center; gap: 5px">
      <span style="width: 6px; height: 6px; box-sizing: border-box; border: 1px solid {INK3}; border-radius: 50%; display: block"></span>
      <span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; {TAB}">GO LIVE · 5</span>
    </button>
    <a href="42-Notifications-Panel.dc.html" aria-label="Notifications" style="position: relative; width: 28px; height: 28px; border-radius: 2px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: {INK}">{icon("bell", 18, INK)}{pill}</a>
  </div>
</header>"""


def tab_bar(active="Home"):
    tabs = [("Home", "house", "Main.dc.html"), ("Arena", "swords", "12-Arena-Offline.dc.html"),
            ("Rankings", "trophy", "16-Rankings.dc.html"), ("Profile", "user", "17-Profile.dc.html")]
    items = []
    for label, ic, href in tabs:
        on = label == active
        color = INK if on else INK3
        cur = ' aria-current="page"' if on else ""
        items.append(
            f'<a href="{href}"{cur} style="flex: 1 1 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3.5px; padding: 10.5px 0; border-top: 2px solid {CTA if on else "transparent"}; color: {color}">'
            f'{icon(ic, 18, color)}'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; text-transform: uppercase; letter-spacing: 1.68px; color: {color}">{label}</span></a>')
    return (f'<nav aria-label="Tabs" style="flex-shrink: 0; background: {S2}; border-top: 1px solid {HAIR}; display: flex; flex-direction: row; padding-bottom: 34px">'
            + "".join(items) + "</nav>")


def meta_tag(text, extra=""):
    return (f'<div style="align-self: flex-start; display: flex; flex-direction: row; align-items: center; padding: 3.5px 7px; border: 1px solid {HAIR}; border-radius: 2px;{extra}">'
            f'<span style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.68px">{text}</span></div>')


def plate(inner, variant="default", pad="14px", extra=""):
    left = {"default": f"1px solid {HAIR}", "live": f"3px solid {POS}"}[variant]
    return (f'<div style="background: {S3}; border: 1px solid {HAIR}; border-left: {left}; border-radius: 4px; padding: {pad}; {extra}">'
            f'{inner}</div>')


def live_pill(label):
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px; flex-shrink: 0">'
            f'<span style="width: 7px; height: 7px; border-radius: 50%; background: {POS}; display: block"></span>'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {POS}; text-transform: uppercase; letter-spacing: 2.52px">{label}</span></div>')


# ---- Home body (app/(app)/(tabs)/(home)/index.tsx) --------------------------
def home_body(with_highlight):
    parts = [
        f'<div style="display: flex; flex-direction: column">{meta_tag("Welcome back")}'
        f'<div style="margin-top: 7px; font-family: {DM}; font-weight: 700; font-size: 26px; line-height: 34px; color: {INK}; white-space: nowrap">Marcus Reyes</div></div>'
    ]
    if with_highlight:
        parts.append(plate(
            f'<a href="34-Highlight-Viewer.dc.html" aria-label="Watch your highlight vs Dana Okafor" style="width: 54px; height: 96px; flex-shrink: 0; border-radius: 2px; background: {S4}; display: flex; align-items: center; justify-content: center">{icon("clapperboard", 18, INK3)}</a>'
            f'<div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 7px">'
            f'<div style="display: flex; flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 7px">{meta_tag("NEW HIGHLIGHT")}'
            f'<button type="button" aria-label="Dismiss" style="{BTN_RESET} width: 21px; height: 21px; display: flex; align-items: center; justify-content: center; border-radius: 2px">{icon("x", 14, INK3)}</button></div>'
            f'<div style="font-family: {DM}; font-weight: 700; font-size: 16px; line-height: 21px; color: {INK}">Your new highlight</div>'
            f'<div style="font-family: {INTER}; font-size: 13px; line-height: 17px; color: {INK2}">vs Dana Okafor · <span style="font-family: {MONO}; {TAB}">28s</span></div>'
            f'<a href="34-Highlight-Viewer.dc.html" style="align-self: flex-start; border: 1px solid {STRONG}; border-radius: 3px; background: {S3}; padding: 7px 14px; font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK}; text-transform: uppercase; letter-spacing: 1.12px">Watch</a>'
            f'</div>', extra="display: flex; flex-direction: row; gap: 10.5px"))
    # EloTile hero with accent bar
    parts.append(
        f'<div style="position: relative; overflow: hidden; background: {S3}; border: 1px solid {HAIR}; border-radius: 4px; padding: 14px 17.5px; display: flex; flex-direction: column; align-items: center">'
        f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 2.52px">Current ELO Rating</span>'
        f'<span style="margin-top: 8px; font-family: {MONO}; font-weight: 700; font-size: 96px; line-height: 105.6px; letter-spacing: -3.84px; color: {INK}; {TAB}">1487</span>'
        f'<span style="position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: {CTA}"></span></div>')
    # Arena nudge card, offline, primary
    parts.append(plate(
        f'<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; margin-bottom: 7px">'
        f'<span style="flex: 1 1 0; font-family: {DM}; font-weight: 700; font-size: 18px; line-height: 24px; color: {INK}">Find a match</span>{meta_tag("Arena")}</div>'
        f'<p style="margin: 0 0 10.5px 0; font-family: {INTER}; font-size: 13px; line-height: 18px; color: {INK2}">Go live in the Arena to challenge athletes who are online and take their challenges as they come in.</p>'
        f'<a href="12-Arena-Offline.dc.html" aria-label="Go to the Arena" style="min-height: 44px; box-sizing: border-box; border-radius: 3px; padding: 10.5px 17.5px; background: {CTA}; display: flex; align-items: center; justify-content: center; font-family: {DM}; font-weight: 700; font-size: 13px; line-height: 17px; color: {ON_CTA}; text-transform: uppercase; letter-spacing: 1.12px">Enter the Arena →</a>'))
    # Recent activity (All scope)
    chip_on = (f'<button type="button" aria-pressed="true" style="{BTN_RESET} display: flex; flex-direction: row; align-items: center; padding: 7px 10.5px; border: 1px solid {CTA}; border-radius: 2px; background: {S3}">'
               f'<span style="width: 6px; height: 6px; background: {CTA}; margin-right: 7px; display: block"></span>'
               f'<span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK}; text-transform: uppercase; letter-spacing: 1.12px">All</span></button>')
    chip_off = (f'<button type="button" aria-pressed="false" style="{BTN_RESET} display: flex; flex-direction: row; align-items: center; padding: 7px 10.5px; border: 1px solid {STRONG}; border-radius: 2px; background: {S3}">'
                f'<span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.12px">Me</span></button>')

    def act(w, l, res, when):
        if res is None:
            return (f'<div style="padding: 10.5px 14px; display: flex; flex-direction: column; gap: 3.5px">'
                    f'<div style="font-family: {INTER}; font-size: 13px; line-height: 18px; color: {INK}"><span style="font-family: {DM}; font-weight: 500">{w}</span> drew with <span style="font-family: {DM}; font-weight: 500">{l}</span></div>'
                    f'<div style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{when}</div></div>')
        return (f'<div style="padding: 10.5px 14px; display: flex; flex-direction: column; gap: 3.5px">'
                f'<div style="font-family: {INTER}; font-size: 13px; line-height: 18px; color: {INK}"><span style="font-family: {DM}; font-weight: 500">{w}</span> defeated <span style="font-family: {DM}; font-weight: 500">{l}</span> by <span style="font-family: {MONO}; font-weight: 500">{res}</span></div>'
                f'<div style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{when}</div></div>')
    parts.append(
        f'<div style="display: flex; flex-direction: column; gap: 10.5px">'
        f'<div style="display: flex; flex-direction: row; align-items: flex-end; justify-content: space-between">{meta_tag("Recent Activity")}</div>'
        f'<div style="display: flex; flex-direction: row; gap: 7px">{chip_on}{chip_off}</div>'
        f'<div style="background: {S3}; border: 1px solid {HAIR}; border-radius: 4px; overflow: hidden">'
        f'{act("Sam Whitfield", "Jordan Cruz", "submission", "Today")}<div style="height: 1px; background: {FAINT}"></div>'
        f'{act("Leo Tanaka", "Priya Shah", None, "Yesterday")}<div style="height: 1px; background: {FAINT}"></div>'
        f'{act("Marcus Reyes", "Dana Okafor", "submission", "2d ago")}<div style="height: 1px; background: {FAINT}"></div>'
        f'{act("Leo Tanaka", "Jordan Cruz", "submission", "5d ago")}</div></div>')
    return (f'<main style="flex: 1 1 0; min-height: 0; overflow: hidden; padding: 24px 16px 0 16px; display: flex; flex-direction: column; gap: 20px">'
            + "".join(W(x) for x in parts) + "</main>")


# ======================================================================
# 41 Practice (lobby phase)
# ======================================================================
def b41():
    tip = plate(
        f'<div style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 2.52px">Practice tip</div>'
        f'<p style="margin: 0; font-family: {INTER}; font-size: 13px; line-height: 17px; color: {INK}">Challenge someone who is on the mat with you. Tap Challenge on your practice partner.</p>',
        extra="display: flex; flex-direction: column; gap: 3.5px")
    golive = plate(
        f'<div style="display: flex; flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 10.5px">'
        f'<div style="flex: 1 1 0">'
        f'<div style="font-family: {DM}; font-weight: 700; font-size: 16px; line-height: 21px; color: {INK}">Looking for a match</div>'
        f'<p style="margin: 3.5px 0 0 0; font-family: {INTER}; font-size: 13px; line-height: 17px; color: {INK2}">Practice lobby. Only your practice partner is here.</p></div>'
        f'{live_pill("Live")}</div>'
        f'<button type="button" aria-label="Go offline" style="{BTN_RESET} margin-top: 14px; width: 100%; min-height: 44px; box-sizing: border-box; border: 1px solid {STRONG}; border-radius: 3px; padding: 0 17.5px; display: flex; align-items: center; justify-content: center; font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.12px">Go offline</button>',
        variant="live")
    section = (f'<div style="display: flex; flex-direction: row; align-items: baseline; justify-content: space-between">'
               f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK2}; text-transform: uppercase; letter-spacing: 2.52px">Online now</span>'
               f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK}; letter-spacing: 2.52px; {TAB}">1</span></div>')
    row = plate(
        f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10.5px">'
        f'<div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: row; align-items: center; gap: 10.5px">'
        f'<div aria-label="Practice Partner" style="width: 28px; height: 28px; box-sizing: border-box; flex-shrink: 0; border-radius: 2px; border: 1px solid {STRONG}; background: {S4}; display: flex; align-items: center; justify-content: center">'
        f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK}; letter-spacing: 1.68px">P·P</span></div>'
        f'<div style="flex: 1 1 0; min-width: 0">'
        f'<div style="font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">Practice Partner</div>'
        f'<div style="margin-top: 1.75px; font-family: {MONO}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK}; {TAB}">No rating</div>'
        f'<div style="margin-top: 1.75px; font-family: {INTER}; font-size: 11px; line-height: 14px; color: {INK2}; white-space: nowrap">Practice bot · 170 lbs</div></div></div>'
        f'<div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 3.5px">'
        f'<button type="button" aria-label="Challenge Practice Partner" style="{BTN_RESET} min-height: 44px; box-sizing: border-box; border: 1px solid {STRONG}; border-radius: 3px; padding: 0 10.5px; display: flex; align-items: center; font-family: {DM}; font-weight: 700; font-size: 11px; line-height: 14px; color: {INK}; text-transform: uppercase; letter-spacing: 1.12px">Challenge</button></div></div>',
        variant="live", pad="10.5px 14px")
    lobby = f'<div style="display: flex; flex-direction: column; gap: 14px">{golive}{section}{row}</div>'
    exit_btn = (f'<a href="43-Settings.dc.html" style="min-height: 44px; box-sizing: border-box; border-radius: 3px; padding: 10.5px 17.5px; display: flex; align-items: center; justify-content: center; '
                f'font-family: {DM}; font-weight: 700; font-size: 13px; line-height: 17px; color: {INK3}; text-decoration: underline; text-transform: uppercase; letter-spacing: 1.12px">Exit practice</a>')
    body = (app_header("Practice Match", "43-Settings.dc.html")
            + f'<main style="flex: 1 1 0; min-height: 0; overflow: hidden; padding: 16px 16px 66px 16px; display: flex; flex-direction: column; gap: 16px">'
            + W(meta_tag("Practice")) + W(tip) + W(lobby) + W(exit_btn) + "</main>")
    return page("Practice: lobby", body)


# ======================================================================
# 42 Notifications panel over Home
# ======================================================================
def notif_row(href, ic, ic_color, title, body, when, unread=False):
    dot = f'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 50%; background: {INK}; display: block"></span>' if unread else ""
    new = '<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">, new</span>' if unread else ""
    return (f'<div style="padding: 0 3.5px">'
            f'<a href="{href}" style="position: relative; display: flex; flex-direction: row; align-items: flex-start; gap: 10.5px; border-radius: 2px; padding: 10.5px; color: {INK}">'
            f'<span style="width: 28px; height: 28px; box-sizing: border-box; flex-shrink: 0; border-radius: 2px; border: 1px solid {HAIR}; background: {S3}; display: flex; align-items: center; justify-content: center">{icon(ic, 14, ic_color)}</span>'
            f'<span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 3.5px">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 13px; line-height: 17px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{title}{new}</span>'
            f'<span style="font-family: {INTER}; font-size: 12px; line-height: 16px; color: {INK2}">{body}</span></span>'
            f'<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 5.25px; padding-top: 1.75px">'
            f'<span style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{when}</span>{dot}</span>'
            f'</a></div>')


def notif_section(label):
    return (f'<h3 style="margin: 0; padding: 14px 14px 3.5px 14px; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{label}</h3>')


def b42():
    rows = (
        notif_section("Yesterday")
        + notif_row("12-Arena-Offline.dc.html", "x-circle", INK3, "Challenge Declined", "Priya Shah declined your casual challenge", "Yesterday")
        + notif_section("Earlier")
        + notif_row("34-Highlight-Viewer.dc.html", "clapperboard", INK3, "Your highlight is ready", "Your reel vs Dana Okafor is ready to watch.", "2d ago", unread=True)
        + notif_row("32-Match-Detail.dc.html", "swords", CTA, "Match Won", "You defeated Dana Okafor (+18 ELO)", "2d ago")
        + notif_row("12-Arena-Offline.dc.html", "check-circle", POS, "Challenge Accepted", "You accepted Dana Okafor's ranked challenge", "2d ago")
        + notif_section("Missed")
        + notif_row("12-Arena-Offline.dc.html", "zap", CTA, "Challenge Received", "Jordan Cruz sent you a casual challenge", "Today")
    )
    sheet = (f'<section role="dialog" aria-label="Notifications" style="position: absolute; left: 0; right: 0; top: 295px; bottom: 0; background: {S2}; border-radius: 15px 15px 0 0; display: flex; flex-direction: column; overflow: hidden">'
             f'<div style="padding: 10px 0; display: flex; justify-content: center; flex-shrink: 0"><span style="width: 30px; height: 4px; border-radius: 4px; background: {INK3}; display: block"></span></div>'
             f'<div style="border-bottom: 1px solid {HAIR}; padding: 0 14px 10.5px 14px; flex-shrink: 0">'
             f'<h2 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; color: {INK}; text-transform: uppercase; letter-spacing: 1.68px">Notifications</h2></div>'
             f'<div style="flex: 1 1 0; min-height: 0; overflow: hidden; padding-bottom: 24px">{rows}</div></section>')
    backdrop = '<a href="Main.dc.html" aria-label="Close notifications" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; background: rgba(0,0,0,.5)"></a>'
    body = brand_header(badge="1") + home_body(with_highlight=True) + tab_bar("Home") + backdrop + sheet
    return page("Notifications panel", body)


# ======================================================================
# Settings family
# ======================================================================
def row_label(t):
    return f'<span style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{t}</span>'


CHEV = f'<span aria-hidden="true" style="font-family: {MONO}; font-size: 14px; line-height: 18px; color: {INK3}">›</span>'
DIVIDER = f'<div style="height: 1px; background: {FAINT}"></div>'
ROW_STYLE = "display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 10.5px 14px; min-height: 38.5px; box-sizing: border-box;"


def nav_row(label, href=None):
    if href:
        return f'<a href="{href}" style="{ROW_STYLE}">{row_label(label)}{CHEV}</a>'
    return f'<button type="button" style="{BTN_RESET} width: 100%; {ROW_STYLE}">{row_label(label)}{CHEV}</button>'


def flat_plate(inner):
    return plate(inner, pad="0", extra="overflow: hidden; display: flex; flex-direction: column")


def W(x):
    return f'<div style="flex-shrink: 0; display: flex; flex-direction: column">{x}</div>'


def settings_main(inner, gap, h_pad_bottom=50):
    return (f'<main style="flex: 1 1 0; min-height: 0; overflow: hidden; padding: 24px 16px {h_pad_bottom}px 16px; display: flex; flex-direction: column; gap: {gap}px">'
            + "".join(W(x) for x in inner) + "</main>")


def b43():
    account = flat_plate(
        f'<div style="{ROW_STYLE.replace("min-height: 38.5px; ", "")}">{row_label("EMAIL")}'
        f'<span style="max-width: 60%; text-align: right; font-family: {MONO}; font-weight: 500; font-size: 12px; line-height: 16px; color: {INK}; text-transform: uppercase; letter-spacing: 1.68px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">marcus.reyes@gmail.com</span></div>'
        + DIVIDER
        + f'<button type="button" aria-label="Sign out" style="{BTN_RESET} width: 100%; {ROW_STYLE}"><span style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {CTA_TEXT}; text-transform: uppercase; letter-spacing: 1.68px">SIGN OUT</span></button>')
    prefs = flat_plate(nav_row("NOTIFICATIONS", "44-Settings-Notifications.dc.html"))
    support = flat_plate(
        nav_row("FEEDBACK", "45-Feedback.dc.html") + DIVIDER
        + nav_row("HELP &amp; SUPPORT", "46-Help.dc.html") + DIVIDER
        + nav_row("VIDEO SETTINGS") + DIVIDER
        + nav_row("PRACTICE MATCH", "41-Practice.dc.html"))
    admin = flat_plate(f'<a href="47-Admin.dc.html" style="{ROW_STYLE}"><span style="display: flex; flex-direction: row; align-items: center; gap: 10.5px">{icon("shield-check", 14, INK3)}{row_label("ADMIN")}</span>{CHEV}</a>')
    body = app_header("Settings", "17-Profile.dc.html") + settings_main([account, prefs, support, admin], 24)
    return page("Settings", body)


def switch(on, label):
    track = PRIMARY if on else MUTED
    left = 22 if on else 2
    return (f'<span role="switch" aria-checked="{"true" if on else "false"}" aria-label="{label}" style="position: relative; width: 51px; height: 31px; flex-shrink: 0; border-radius: 16px; background: {track}; display: block">'
            f'<span style="position: absolute; top: 2px; left: {left}px; width: 27px; height: 27px; border-radius: 50%; background: {BG}; display: block"></span></span>')


def b44():
    toggles = [("CHALLENGES", "New, accepted, declined, and expiring challenges", True),
               ("CHAT MESSAGES", "New messages in conversations", False),
               ("MATCHES", "Match start notifications", True)]
    rows = []
    for i, (label, desc, on) in enumerate(toggles):
        if i:
            rows.append(DIVIDER)
        rows.append(
            f'<button type="button" aria-label="{label}" style="{BTN_RESET} width: 100%; box-sizing: border-box; display: flex; flex-direction: row; align-items: center; gap: 10.5px; padding: 10.5px 14px">'
            f'<span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column">'
            f'<span style="margin-bottom: 3.5px; font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{label}</span>'
            f'<span style="font-family: {INTER}; font-size: 12px; line-height: 16.5px; color: {INK3}">{desc}</span></span>'
            f'{switch(on, label)}</button>')
    foot = (f'<p style="margin: 0; font-family: {INTER}; font-size: 12px; line-height: 19.5px; color: {INK3}">'
            f'Changes are saved automatically. You can also manage notifications through your device settings.</p>')
    body = app_header("Notifications", "43-Settings.dc.html") + settings_main([flat_plate("".join(rows)), foot], 16)
    return page("Settings: notifications", body)


def b45():
    def chip(label, active):
        if active:
            return (f'<button type="button" aria-pressed="true" style="{BTN_RESET} display: flex; flex-direction: row; align-items: center; padding: 7px 10.5px; border: 1px solid {CTA}; border-radius: 2px; background: {S3}">'
                    f'<span style="width: 6px; height: 6px; background: {CTA}; margin-right: 7px; display: block"></span>'
                    f'<span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK}; text-transform: uppercase; letter-spacing: 1.12px">{label}</span></button>')
        return (f'<button type="button" aria-pressed="false" style="{BTN_RESET} display: flex; flex-direction: row; align-items: center; padding: 7px 10.5px; border: 1px solid {STRONG}; border-radius: 2px; background: {S3}">'
                f'<span style="font-family: {DM}; font-weight: 700; font-size: 10px; line-height: 13px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.12px">{label}</span></button>')
    field_label = lambda t, f=None: (f'<label{" for=" + chr(34) + f + chr(34) if f else ""} style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px">{t}</label>')
    msg = "Timer kept running after we both paused my ranked match with Dana. I had to end it by hand."
    inner = [
        f'<p style="margin: 0; font-family: {INTER}; font-size: 12px; line-height: 19.5px; color: {INK2}">Found a bug or have an idea? We read every submission.</p>',
        f'<div role="group" aria-label="Category" style="display: flex; flex-direction: column; gap: 7px">{field_label("CATEGORY")}'
        f'<div style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 7px">{chip("BUG", True)}{chip("FEATURE", False)}{chip("GENERAL", False)}</div></div>',
        f'<div style="display: flex; flex-direction: column; gap: 7px">{field_label("MESSAGE", "feedback-message")}'
        f'<textarea id="feedback-message" placeholder="Tell us what you think..." maxlength="2000" style="margin: 0; min-height: 144px; resize: none; box-sizing: border-box; width: 100%; font-family: {MONO}; font-size: 12px; line-height: 17px; color: {INK}; background: {S3}; border: 1px solid {HAIR}; border-radius: 2px; padding: 10.5px">{msg}</textarea>'
        f'<span style="text-align: right; font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 1.68px; {TAB}">{len(msg)}/2000</span></div>',
        f'<button type="button" style="{BTN_RESET} width: 100%; box-sizing: border-box; border-radius: 3px; padding: 10.5px 14px; background: {CTA}; display: flex; align-items: center; justify-content: center; font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 18px; color: {ON_CTA}; text-transform: uppercase; letter-spacing: 1.12px">SUBMIT FEEDBACK</button>'
    ]
    body = app_header("Feedback", "43-Settings.dc.html") + settings_main(inner, 20)
    return page("Settings: feedback", body)


HELP = [
    ("Getting Started", [
        "ELO RATED is a participation-only ranking platform. You find opponents in the Arena, complete ranked matches, and the system handles your rating.",
        "Open the Arena tab and tap Go live to join the lobby. Anyone else who is live can challenge you, and you can challenge them. You can have up to 3 challenges out at once.",
        "A challenge arrives as a live prompt. Accept it and you both drop straight into the match, so be on the mat together before you go live.",
        "Once you're live you stay live across the whole app, on Home, Rankings and Profile too, and challenges reach you wherever you are. The LIVE pill in the header shows it; tap it to jump back to the Arena.",
        "You stay live until you go offline in the Arena. Switching away from the app takes you offline, and you're put back live when you return.",
    ]),
    ("How ELO Works", [
        "Universal starting rating. No belt seeding. Weight is normalized into the exchange so heavier athletes get a small phantom-ELO offset (+50 per IBJJF division gap).",
        "Submission-only. Tap or don't. Draws cost ELO for both fighters; equal matches get the harshest Pressure Score penalty.",
        "Wins, losses, and draws all move your number. Your number is your number.",
    ]),
    ("Match Footage &amp; Privacy", [
        "You own your match footage. You can always download it from your profile. Server-side retention on the free tier may be limited; access to your own data is not.",
        "Your profile and rating are public on the global ladder. Personal data is governed by the Privacy Policy linked in the End User Agreement.",
    ]),
    ("Report a Problem", [
        "Spotted a wrong result, a dispute that wasn't resolved, or an opponent breaking the rules? Send a feedback note from Settings, Feedback.",
        "For urgent issues (safety, abuse, account compromise), email support@elorated.com with the match ID.",
    ]),
]


def b46():
    plates = []
    for title, paras in HELP:
        ps = "".join(f'<p style="margin: 0; font-family: {INTER}; font-size: 12px; line-height: 19.5px; color: {INK2}">{p}</p>' for p in paras)
        plates.append(plate(
            f'<h2 style="margin: 0 0 10.5px 0; font-family: {DM}; font-weight: 700; font-size: 16px; line-height: 21px; color: {INK}; text-transform: uppercase; letter-spacing: 1.12px">{title}</h2>'
            f'<div style="display: flex; flex-direction: column; gap: 10.5px">{ps}</div>'))
    body = app_header("Help &amp; Support", "43-Settings.dc.html") + settings_main(plates, 16, 50)
    return page("Settings: help", body, h=1320)


def b47():
    rows = []
    for i, label in enumerate(["MEMBERS", "METRICS", "FEATURE FLAGS", "NO-MATCH VIDEOS"]):
        if i:
            rows.append(DIVIDER)
        rows.append(nav_row(label))
    body = app_header("Admin", "43-Settings.dc.html") + settings_main([flat_plate("".join(rows))], 24)
    return page("Settings: admin", body)


# ======================================================================
# 48 System overlays over Home
# ======================================================================
def b48():
    offline = (f'<div role="status" style="position: absolute; top: 0; left: 0; right: 0; z-index: 1000; padding-top: 47px; pointer-events: none">'
               f'<div style="background: {DESTRUCTIVE}; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 7px; padding: 7px 14px">'
               f'{icon("wifi-off", 14, FG)}'
               f'<span style="font-family: {INTER}; font-weight: 500; font-size: 10.5px; line-height: 14px; color: {FG}">You\'re offline. Some features may not work.</span></div></div>')
    update = (f'<div role="status" style="position: absolute; left: 16px; right: 16px; bottom: 106px; z-index: 900">'
              f'<div style="background: {FG}; border-radius: 4px; padding: 10.5px 14px; display: flex; flex-direction: column; gap: 7px">'
              f'<div style="display: flex; flex-direction: row; align-items: center; gap: 7px">{icon("refresh-cw", 16, BG)}'
              f'<span aria-label="App updated. Restart for the latest experience." style="flex: 1 1 0; font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; color: {BG}; text-transform: uppercase; letter-spacing: 1.68px">Update ready</span>'
              f'<button type="button" aria-label="Dismiss update notice" style="{BTN_RESET} width: 44px; height: 44px; margin: -13px -13px -13px 0; display: flex; align-items: center; justify-content: center">{icon("x", 18, BG)}</button></div>'
              f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10.5px">'
              f'<span aria-hidden="true" style="flex: 1 1 0; font-family: {INTER}; font-size: 14px; line-height: 21px; color: {BG}">Restart for the latest experience.</span>'
              f'<button type="button" style="{BTN_RESET} height: 35px; box-sizing: border-box; padding: 0 14px; border-radius: 4px; background: {BG}; display: flex; align-items: center; justify-content: center; gap: 7px; font-family: {DM}; font-weight: 700; font-size: 12px; line-height: 16px; color: {FG}; text-transform: uppercase; letter-spacing: 1.68px">Restart</button>'
              f'</div></div></div>')
    body = brand_header() + home_body(with_highlight=False) + tab_bar("Home") + offline + update
    return page("Home: offline and update", body)


FILES = {
    "41-Practice.dc.html": b41,
    "42-Notifications-Panel.dc.html": b42,
    "43-Settings.dc.html": b43,
    "44-Settings-Notifications.dc.html": b44,
    "45-Feedback.dc.html": b45,
    "46-Help.dc.html": b46,
    "47-Admin.dc.html": b47,
    "48-System-Overlays.dc.html": b48,
}

if __name__ == "__main__":
    for name, fn in FILES.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(fn())
        print("wrote", name)
