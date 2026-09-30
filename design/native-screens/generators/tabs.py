#!/usr/bin/env python3
"""Generates the tab artboards (Home, Arena, Rankings, Profile) as static .dc.html markup.

Source of truth: jits_web/apps/mobile (read only). Every size / string below is copied
from the component named in the comment next to it. NativeWind rem = 14 on native, so a
Tailwind spacing unit is 3.5px (p-4 = 14, py-3 = 10.5, w-8 = 28, h-11 = 38.5, h-14 = 49).
Arbitrary [..px] classes, config px values (radius, tracking) and inline styles stay literal.
"""
import os

OUT = os.environ.get("NATIVE_SCREENS_OUT", os.path.join(os.getcwd(), "project"))

# lib/tokens.ts darkTokens
S1 = "#0D0F14"
S2 = "#13151B"
S3 = "#1E222B"
S4 = "#262A34"
INK = "#E8EDF2"
INK2 = "#9CA3AF"
INK3 = "#8D929D"
CTA = "#E63946"
CTA_TEXT = "#EC6A74"
ON_CTA = "#0D0F14"
POS = "#22C55E"
NEG = "#EC6A74"
AMBER = "#F59E0B"
HL = "rgba(107,114,128,.45)"
HLF = "rgba(107,114,128,.20)"
HLS = "rgba(107,114,128,.62)"
EM_DASH = "&#8212;"

DISPLAY = "font-family: 'Bebas Neue',sans-serif; font-weight: 400"
H7 = "font-family: 'DM Sans',sans-serif; font-weight: 700"
H5 = "font-family: 'DM Sans',sans-serif; font-weight: 500"
B4 = "font-family: 'Inter',sans-serif; font-weight: 400"
M4 = "font-family: 'JetBrains Mono',monospace; font-weight: 400"
M5 = "font-family: 'JetBrains Mono',monospace; font-weight: 500"
M7 = "font-family: 'JetBrains Mono',monospace; font-weight: 700"
TAB = "font-variant-numeric: tabular-nums"
UP = "text-transform: uppercase"

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700'
         '&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">')

BTN_RESET = "background: none; border: 0; margin: 0; padding: 0; cursor: pointer; font: inherit; color: inherit"


def page(title, body, h):
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
<div style="width: 390px; height: {h}px; box-sizing: border-box; background: {S1}; color: {INK}; display: flex; flex-direction: column; overflow: hidden; position: relative">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""


def write(name, title, body, h):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(page(title, body, h))


# ---------------------------------------------------------------- icons (lucide, 24 viewBox)
ICONS = {
    "house": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
    "swords": '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" x2="19" y1="19" y2="13"></line><line x1="16" x2="20" y1="16" y2="20"></line><line x1="19" x2="21" y1="21" y2="19"></line><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"></polyline><line x1="5" x2="9" y1="14" y2="18"></line><line x1="7" x2="4" y1="17" y2="20"></line><line x1="3" x2="5" y1="19" y2="21"></line>',
    "trophy": '<path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"></path><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"></path><path d="M18 9h1.5a1 1 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6 9H4.5a1 1 0 0 1 0-5H6"></path>',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    "bell": '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>',
    "chevron-left": '<path d="m15 18-6-6 6-6"></path>',
    "chevron-right": '<path d="m9 18 6-6-6-6"></path>',
    "arrow-up-right": '<path d="M7 7h10v10"></path><path d="M7 17 17 7"></path>',
    "clapperboard": '<path d="m12.296 3.464 3.02 3.956"></path><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"></path><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="m6.18 5.276 3.1 3.899"></path>',
    "x": '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    "palette": '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"></path><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>',
    "sun": '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
    "moon": '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"></path>',
    "monitor": '<rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line>',
    "user-pen": '<path d="M11.5 15H7a4 4 0 0 0-4 4v2"></path><path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"></path><circle cx="10" cy="7" r="4"></circle>',
    "settings": '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle>',
}


def icon(name, size, color):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
            f'style="color: {color}; display: block; flex-shrink: 0">{ICONS[name]}</svg>')


# ---------------------------------------------------------------- primitives

def meta_tag(text, extra=""):
    # elo-system/meta-tag.tsx: self-start px-2 py-1 (7 / 3.5) border-hairline rounded-xs; mono 10 ink-2 uppercase caps-l
    return (f'<span style="align-self: flex-start; display: inline-flex; align-items: center; padding: 3.5px 7px; '
            f'border: 1px solid {HL}; border-radius: 2px; {M4}; font-size: 10px; line-height: 13px; color: {INK2}; '
            f'{UP}; letter-spacing: 1.68px; white-space: nowrap; {extra}">{text}</span>')


def plate(inner, variant="default", extra=""):
    # elo-system/plate.tsx: bg-surface-3 border border-hairline rounded-md p-4 (14); accent = border-l-[3px] cta
    left = {"default": f"1px solid {HL}", "accent": f"3px solid {CTA}"}[variant]
    return (f'<div style="background: {S3}; border: 1px solid {HL}; border-left: {left}; border-radius: 4px; '
            f'padding: 14px; display: flex; flex-direction: column; {extra}">{inner}</div>')


def chip(label, active):
    # elo-system/chip.tsx: px-3 py-2 (10.5 / 7) border rounded-xs bg-surface-3; active border-cta + 6x6 cta square mr-2 (7)
    sq = (f'<span aria-hidden="true" style="width: 6px; height: 6px; background: {CTA}; margin-right: 7px; '
          f'flex-shrink: 0"></span>') if active else ""
    return (f'<button type="button" aria-pressed="{"true" if active else "false"}" style="{BTN_RESET}; display: inline-flex; '
            f'align-items: center; align-self: flex-start; padding: 7px 10.5px; border: 1px solid {CTA if active else HLS}; '
            f'border-radius: 2px; background: {S3}">{sq}<span style="{H7}; font-size: 10px; line-height: 13px; {UP}; '
            f'letter-spacing: 1.12px; color: {INK if active else INK2}">{label}</span></button>')


def initials_dot(name):
    # avatar-32.tsx getInitials: "F·L"
    p = name.split()
    return f"{p[0][0]}·{p[-1][0]}".upper() if len(p) > 1 else p[0][0].upper()


def avatar32(name):
    # avatar-32.tsx: w-8 h-8 (28) rounded-xs border-hairline-strong bg-surface-4; mono-bold 10 ink caps-l
    return (f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; flex-shrink: 0; '
            f'border-radius: 2px; border: 1px solid {HLS}; background: {S4}; display: flex; align-items: center; '
            f'justify-content: center; {M7}; font-size: 10px; letter-spacing: 1.68px; color: {INK}">{initials_dot(name)}</span>')


# ---------------------------------------------------------------- header chrome

def status_chip(kind, text, aria, interactive=True):
    # header-status-chip.tsx + lib/arena/header-chip-model.ts: 28pt frame (CHIP_HEIGHT), rounded-xs border, pad 8,
    # glyph gap 5, glyph 6pt, text font-mono-bold 10 uppercase tabular (no tracking). live: positive border/text + 10% fill.
    if kind == "live":
        border, color, fill = POS, POS, "rgba(34,197,94,.10)"
        glyph = f'<span aria-hidden="true" style="width: 6px; height: 6px; border-radius: 3px; background: {POS}; flex-shrink: 0"></span>'
    else:
        border, color, fill = INK3, INK3, "transparent"
        glyph = (f'<span aria-hidden="true" style="width: 6px; height: 6px; box-sizing: border-box; border-radius: 3px; '
                 f'border: 1px solid {INK3}; flex-shrink: 0"></span>')
    tag_open = f'<button type="button" aria-label="{aria}"' if interactive else f'<span role="text" aria-label="{aria}"'
    tag_close = "</button>" if interactive else "</span>"
    return (f'{tag_open} style="{BTN_RESET}; height: 28px; box-sizing: border-box; '
            f'display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid {border}; '
            f'border-radius: 2px; background: {fill}; max-width: 160px; overflow: hidden; flex-shrink: 1">{glyph}'
            f'<span style="{M7}; font-size: 10px; line-height: 13px; {UP}; color: {color}; {TAB}; white-space: nowrap">'
            f'{text}</span>{tag_close}')


CHIP_OFFLINE = ("offline", "GO LIVE · 5", "Live status: 5 on the mat. Go live")
CHIP_LIVE = ("live", "LIVE · 5", "Live status: 5 on the mat. Open live menu")


def bell(count=0):
    # notification-bell.tsx: w-8 h-8 (28) rounded-xs; Bell 18 textPrimary; CountPill top-0 right-0
    # (count-pill.tsx: min-h-4 min-w-4 = 14, px-1 = 3.5, rounded-xs, bg-cta, mono-bold 9 ink-on-cta)
    pill = ""
    if count:
        pill = (f'<span aria-hidden="true" style="position: absolute; top: 0; right: 0; min-width: 14px; min-height: 14px; '
                f'box-sizing: border-box; padding: 0 3.5px; border-radius: 2px; background: {CTA}; display: flex; '
                f'align-items: center; justify-content: center; {M7}; font-size: 9px; line-height: 12px; color: {ON_CTA}">{count}</span>')
    label = f"Notifications, {count} new" if count else "Notifications"
    return (f'<a href="42-Notifications-Panel.dc.html" aria-label="{label}" style="position: relative; width: 28px; '
            f'height: 28px; border-radius: 2px; display: flex; align-items: center; justify-content: center; '
            f'flex-shrink: 0; color: {INK}">{icon("bell", 18, INK)}{pill}</a>')


def header_actions(chip_args, bell_count=0):
    # tab-header.tsx TabHeaderActions: flex-row justify-end gap-2 (7)
    return (f'<div style="display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex: 1 1 auto; '
            f'min-width: 0">{status_chip(*chip_args)}{bell(bell_count)}</div>')


def header_bar(pad_x):
    return (f"flex-shrink: 0; box-sizing: border-box; height: 103px; padding: 47px {pad_x}px 0; background: {S2}; "
            f"border-bottom: 1px solid {HL}; display: flex; align-items: center; justify-content: space-between; gap: 12px")


def brand_header(chip_args, bell_count=0):
    # brand-header.tsx: className px-4 (14), height 56 + insets.top, gap 12; Wordmark md (22px Bebas, lh 22, tracking-mark)
    return (f'<header style="{header_bar(14)}"><div style="{DISPLAY}; font-size: 22px; line-height: 22px; '
            f'letter-spacing: -0.07px; color: {INK}; flex-shrink: 0">ELO RATED</div>'
            f'{header_actions(chip_args, bell_count)}</header>')


def tab_header(title, chip_args, bell_count=0):
    # tab-header.tsx: style padding max(16, inset), gap 12; title font-heading 12 ink-2 uppercase caps-l at LEFT
    return (f'<header style="{header_bar(16)}"><h1 style="margin: 0; {H7}; font-size: 12px; line-height: 16px; color: {INK2}; '
            f'{UP}; letter-spacing: 1.68px; flex-shrink: 0">{title}</h1>{header_actions(chip_args, bell_count)}</header>')


def app_header(title, back_href):
    # app-header.tsx: padding 16 (style); side slots flex 1 / height 32; back w-8 h-8 (28) ChevronLeft 20 ink-2;
    # centred title heading 12 ink-2 caps-l
    return (f'<header style="{header_bar(16)}; justify-content: flex-start; gap: 0">'
            f'<div style="flex: 1 1 0; height: 32px"><a href="{back_href}" aria-label="Go back" style="width: 28px; '
            f'height: 28px; border-radius: 2px; display: flex; align-items: center; justify-content: center">'
            f'{icon("chevron-left", 20, INK2)}</a></div>'
            f'<h1 style="margin: 0; {H7}; font-size: 12px; line-height: 16px; color: {INK2}; {UP}; letter-spacing: 1.68px">{title}</h1>'
            f'<div style="flex: 1 1 0; height: 32px"></div></header>')


TABS = [("Home", "house", "Main.dc.html"), ("Arena", "swords", "12-Arena-Offline.dc.html"),
        ("Rankings", "trophy", "16-Rankings.dc.html"), ("Profile", "user", "17-Profile.dc.html")]


def tab_bar(active, arena_dot=False, arena_count=0):
    # elo-tab-bar.tsx: bg-surface-2 border-t hairline; flex-1 items-center gap-1 (3.5) py-3 (10.5) border-t-[2px];
    # icon 18 (ink active / ink-3); label font-heading 10 uppercase caps-l.
    # Arena badge while live (lib/arena/mat-board.ts arenaTabBadge "dot"): w-2 h-2 (7) green, -top-0.5 -right-1.5
    cells = []
    for label, ic, href in TABS:
        on = label == active
        color = INK if on else INK3
        badge = ""
        if label == "Arena" and arena_dot:
            badge = (f'<span aria-hidden="true" style="position: absolute; top: -1.75px; right: -5.25px; width: 7px; height: 7px; '
                     f'border-radius: 3.5px; background: {POS}"></span>')
        if label == "Arena" and arena_count:
            # fresh incoming challenges: red CountPill at -top-1.5 -right-2.5 (-5.25 / -8.75)
            badge = (f'<span aria-hidden="true" style="position: absolute; top: -5.25px; right: -8.75px; min-width: 14px; min-height: 14px; '
                     f'box-sizing: border-box; padding: 0 3.5px; border-radius: 2px; background: {CTA}; display: flex; align-items: center; '
                     f'justify-content: center; {M7}; font-size: 9px; line-height: 12px; color: {ON_CTA}">{arena_count}</span>')
        cur = ' aria-current="page"' if on else ""
        aria = f' aria-label="{label}, Live"' if (label == "Arena" and arena_dot) else ""
        if label == "Arena" and arena_count:
            aria = f' aria-label="{label}, {arena_count} challenge"'

        cells.append(
            f'<a href="{href}"{cur}{aria} style="flex: 1 1 0; display: flex; flex-direction: column; align-items: center; '
            f'justify-content: center; gap: 3.5px; padding: 10.5px 0; border-top: 2px solid {CTA if on else "transparent"}; '
            f'color: {color}"><span style="position: relative; display: block">{icon(ic, 18, color)}{badge}</span>'
            f'<span style="{H7}; font-size: 10px; line-height: 13px; {UP}; letter-spacing: 1.68px; color: {color}">{label}</span></a>')
    return (f'<nav aria-label="Tabs" style="flex-shrink: 0; background: {S2}; border-top: 1px solid {HL}; display: flex; '
            f'padding-bottom: 34px">{"".join(cells)}</nav>')


# ---------------------------------------------------------------- Home pieces

def welcome(name="Marcus Reyes", back=True):
    # (home)/index.tsx: MetaTag "Welcome back" + font-heading 26 ink mt-2 (7)
    return (f'<div style="display: flex; flex-direction: column">{meta_tag("Welcome back" if back else "Welcome")}'
            f'<h1 style="margin: 7px 0 0; {H7}; font-size: 26px; line-height: 32px; color: {INK}; white-space: nowrap; '
            f'overflow: hidden; text-overflow: ellipsis">{name}</h1></div>')


def elo_hero(value=1487):
    # elo-tile.tsx SingleTile size hero (96), accentBar: bg-surface-3 border-hairline rounded-md py-4 px-5 (14 / 17.5);
    # value mono-bold 96, lineHeight 105.6, letterSpacing -3.84, marginTop 8 (style)
    return (f'<div style="position: relative; overflow: hidden; background: {S3}; border: 1px solid {HL}; border-radius: 4px; '
            f'padding: 14px 17.5px; display: flex; flex-direction: column; align-items: center">'
            f'<span style="{M7}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 2.52px">Current ELO Rating</span>'
            f'<span style="{M7}; font-size: 96px; line-height: 105.6px; letter-spacing: -3.84px; margin-top: 8px; color: {INK}; {TAB}">{value}</span>'
            f'<span aria-hidden="true" style="position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: {CTA}"></span></div>')


def cta_link(label, href, aria, red=True):
    # arena-nudge-card / resume-match-card button: rounded-sm min-h-[44px] py-3 px-5 (10.5 / 17.5); heading 13 uppercase caps
    if red:
        style = f"background: {CTA}; color: {ON_CTA}"
    else:
        style = f"background: {S3}; border: 1px solid {HLS}; color: {INK}"
    return (f'<a href="{href}" aria-label="{aria}" style="{style}; border-radius: 3px; min-height: 44px; box-sizing: border-box; '
            f'padding: 10.5px 17.5px; display: flex; align-items: center; justify-content: center">'
            f'<span style="{H7}; font-size: 13px; line-height: 17px; {UP}; letter-spacing: 1.12px">{label}</span></a>')


def card_title_row(title, tag):
    # flex-row items-center justify-between mb-2 (7); title font-heading 18 ink flex-1
    return (f'<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px">'
            f'<h2 style="margin: 0; flex: 1; {H7}; font-size: 18px; line-height: 23px; color: {INK}; white-space: nowrap; '
            f'overflow: hidden; text-overflow: ellipsis">{title}</h2>{meta_tag(tag)}</div>')


def body13(text):
    # font-body 13 ink-2 mb-3 (10.5)
    return f'<p style="margin: 0 0 10.5px; {B4}; font-size: 13px; line-height: 18px; color: {INK2}">{text}</p>'


def arena_nudge(live=False, secondary=False):
    # dashboard/arena-nudge-card.tsx
    title = "You're live" if live else "Find a match"
    body = ("You're in the lobby. Challenges reach you on any tab." if live else
            "Go live in the Arena to challenge athletes who are online and take their challenges as they come in.")
    label = "Open the Arena →" if live else "Enter the Arena →"
    href = "13-Arena-Live.dc.html" if live else "12-Arena-Offline.dc.html"
    return plate(card_title_row(title, "Arena") + body13(body) + cta_link(label, href, "Go to the Arena", red=not secondary))


def resume_card():
    # dashboard/resume-match-card.tsx; status in_progress -> wizard step "live" (lib/match-flow/step-router.ts)
    return plate(card_title_row("Match in progress", "In progress") +
                 body13("vs Leo Tanaka. Pick up where you left off.") +
                 cta_link("Resume match →", "24-Live-Broadcast.dc.html", "Resume your match"), variant="accent")


def new_highlight_card():
    # dashboard/new-highlight-card.tsx + lib/highlight/discovery.ts DISCOVERY_COPY. Plate flex-row gap-3 (10.5);
    # poster 54x96 rounded-xs bg-surface-4; right gap-2 (7); dismiss w-6 h-6 (21) X 14 ink-3; Watch py-2 px-4 (7 / 14)
    poster = (f'<a href="34-Highlight-Viewer.dc.html" aria-label="Watch your highlight vs Dana Okafor" style="width: 54px; '
              f'height: 96px; flex-shrink: 0; border-radius: 2px; overflow: hidden; background: {S4}; display: flex; '
              f'align-items: center; justify-content: center"><span style="{M7}; font-size: 8px; letter-spacing: 1px; '
              f'color: {INK3}">POSTER</span></a>')
    right = (f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px">'
             f'<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 7px">{meta_tag("NEW HIGHLIGHT")}'
             f'<button type="button" aria-label="Dismiss" style="{BTN_RESET}; width: 21px; height: 21px; border-radius: 2px; '
             f'display: flex; align-items: center; justify-content: center">{icon("x", 14, INK3)}</button></div>'
             f'<h2 style="margin: 0; {H7}; font-size: 16px; line-height: 21px; color: {INK}">Your new highlight</h2>'
             f'<p style="margin: 0; {B4}; font-size: 13px; line-height: 18px; color: {INK2}; white-space: nowrap">vs Dana Okafor · '
             f'<span style="{M4}; {TAB}">28s</span></p>'
             f'<a href="34-Highlight-Viewer.dc.html" style="align-self: flex-start; border: 1px solid {HLS}; border-radius: 3px; '
             f'background: {S3}; padding: 7px 14px; color: {INK}"><span style="{H7}; font-size: 12px; line-height: 16px; {UP}; '
             f'letter-spacing: 1.12px">Watch</span></a></div>')
    return plate(poster + right, extra="flex-direction: row; gap: 10.5px")


ACTIVITY = [
    ("Sam Whitfield", "Jordan Cruz", "submission", "Today"),
    ("Leo Tanaka", "Priya Shah", "draw", "Yesterday"),
    ("Marcus Reyes", "Dana Okafor", "submission", "2d ago"),
    ("Leo Tanaka", "Jordan Cruz", "submission", "5d ago"),
]


def recent_activity(items=ACTIVITY):
    # dashboard/recent-activity-section.tsx (scope "all" by default): gap-3 (10.5), chips gap-2 (7);
    # activity-feed-item.tsx px-4 py-3 gap-1 (14 / 10.5 / 3.5); separators h-px hairline-faint
    rows = []
    for i, (w, l, res, when) in enumerate(items):
        sep = f'<div style="height: 1px; background: {HLF}"></div>' if i else ""
        nm = lambda n: f'<span style="{H5}; color: {INK}">{n}</span>'
        if res == "draw":
            line = f'{nm(w)} drew with {nm(l)}'
        else:
            line = f'{nm(w)} defeated {nm(l)} by <span style="{M5}; color: {INK}">{res}</span>'
        rows.append(f'{sep}<div style="padding: 10.5px 14px; display: flex; flex-direction: column; gap: 3.5px">'
                    f'<p style="margin: 0; {B4}; font-size: 13px; line-height: 18px; color: {INK}">{line}</p>'
                    f'<span style="{M4}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 1.68px">{when}</span></div>')
    return (f'<section style="display: flex; flex-direction: column; gap: 10.5px">'
            f'<div style="display: flex; align-items: flex-end; justify-content: space-between">{meta_tag("Recent Activity")}</div>'
            f'<div style="display: flex; gap: 7px">{chip("All", True)}{chip("Me", False)}</div>'
            f'<div style="background: {S3}; border: 1px solid {HL}; border-radius: 4px; overflow: hidden">{"".join(rows)}</div></section>')


def record(w=14, l=6, d=1):
    # dashboard/stat-overview.tsx: gap-2 (7); MetaTag "Record" + mono-bold 28 / lh 32 / ls -0.6
    return (f'<section style="display: flex; flex-direction: column; gap: 7px">{meta_tag("Record")}'
            f'<span style="{M7}; font-size: 28px; line-height: 32px; letter-spacing: -0.6px; color: {INK}">{w}W · {l}L · {d}D</span></section>')


def keep(children):
    # scroll content never shrinks: each child is a non-shrinking flex column
    return "".join(f'<div style="flex-shrink: 0; display: flex; flex-direction: column">{c}</div>' for c in children)


def home_scroll(children):
    # ScrollView contentContainerStyle (inline): paddingHorizontal 16, paddingTop 24, paddingBottom 32 + inset, gap 20
    return (f'<main style="flex: 1 1 auto; min-height: 0; overflow: hidden; box-sizing: border-box; padding: 24px 16px 66px; '
            f'display: flex; flex-direction: column; gap: 20px">{keep(children)}</main>')


def build_home():
    body = (brand_header(CHIP_OFFLINE) +
            home_scroll([welcome(), elo_hero(), arena_nudge(), recent_activity(), record()]) +
            tab_bar("Home"))
    write("Main.dc.html", "Home", body, 1200)


def build_home_resume():
    body = (brand_header(CHIP_OFFLINE, bell_count=1) +
            home_scroll([welcome(), resume_card(), new_highlight_card(), elo_hero(), arena_nudge(secondary=True),
                         recent_activity(ACTIVITY[:HOME_RESUME_ITEMS]), record()]) +
            tab_bar("Home"))
    write("11-Home-Resume.dc.html", "Home: resume match", body, 1420)


# ---------------------------------------------------------------- Arena (Mat Board)

def section_label(label, right=None):
    # mat-board.tsx MatSectionLabel: mb-1 (3.5); heading 10 ink-3 uppercase caps-xl; right mono-bold 10 ink-2 uppercase tabular
    r = (f'<span style="{M7}; font-size: 10px; line-height: 13px; color: {INK2}; {UP}; {TAB}">{right}</span>') if right else ""
    return (f'<div style="margin-bottom: 3.5px; display: flex; align-items: baseline; justify-content: space-between">'
            f'<h2 style="margin: 0; {H7}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 2.52px">{label}</h2>{r}</div>')


def control_bar(live):
    # mat-board.tsx MatControlBar: h-14 (49) border-b hairline bg-surface-2 px-4 (14) gap-3 (10.5); segments h-8 (28)
    # px-3 (10.5) gap-1.5 (5.25) in rounded-xs border-hairline-strong; selected bg-surface-4; dot h-1.5 w-1.5 (5.25);
    # label heading 10 uppercase caps; counts mono-bold 10 ink-2 uppercase tabular ml-auto
    def seg(is_live):
        selected = live == is_live
        color = (POS if is_live else INK) if selected else INK3
        dot = ""
        if is_live:
            dot = (f'<span aria-hidden="true" style="width: 5.25px; height: 5.25px; border-radius: 3px; '
                   f'background: {POS if selected else INK3}"></span>')
        aria = ("You are live" if is_live else "You are offline") if selected else ("Go live" if is_live else "Go offline")
        inner = (f'{dot}<span style="{H7}; font-size: 10px; line-height: 13px; {UP}; letter-spacing: 1.12px; color: {color}">'
                 f'{"Live" if is_live else "Offline"}</span>')
        style = (f"height: 28px; box-sizing: border-box; display: flex; align-items: center; gap: 5.25px; padding: 0 10.5px; "
                 f"background: {S4 if selected else 'transparent'}")
        if selected:
            return f'<button type="button" disabled="" aria-label="{aria}" aria-pressed="true" style="{BTN_RESET}; {style}">{inner}</button>'
        href = "13-Arena-Live.dc.html" if is_live else "12-Arena-Offline.dc.html"
        return f'<a href="{href}" aria-label="{aria}" style="{style}">{inner}</a>'
    return (f'<div style="flex-shrink: 0; height: 49px; box-sizing: border-box; display: flex; align-items: center; gap: 10.5px; '
            f'border-bottom: 1px solid {HL}; background: {S2}; padding: 0 14px">'
            f'<div style="display: flex; overflow: hidden; border-radius: 2px; border: 1px solid {HLS}">{seg(False)}{seg(True)}</div>'
            f'<span style="margin-left: auto; {M7}; font-size: 10px; line-height: 13px; color: {INK2}; {UP}; {TAB}; '
            f'white-space: nowrap">5 ON MAT · 3 IN BAND</span></div>')


def outline_action(label, aria, dim=False, disabled=False, href=None):
    # mat-board.tsx OutlineAction: h-8 (28) rounded-xs border px-3 (10.5); heading 11 uppercase caps;
    # dim = border-hairline + ink-3; disabled opacity .5
    style = (f"height: 28px; box-sizing: border-box; display: flex; align-items: center; border-radius: 2px; "
             f"border: 1px solid {HL if dim else HLS}; padding: 0 10.5px; flex-shrink: 0; {'opacity: 0.5;' if disabled else ''}")
    inner = (f'<span style="{H7}; font-size: 11px; line-height: 14px; {UP}; letter-spacing: 1.12px; '
             f'color: {INK3 if dim else INK}">{label}</span>')
    if href and not disabled:
        return f'<a href="{href}" aria-label="{aria}" style="{style}">{inner}</a>'
    dis = ' disabled=""' if disabled else ""
    return f'<button type="button"{dis} aria-label="{aria}" style="{BTN_RESET}; {style}">{inner}</button>'


def closest_card(name, elo, gap, lbs, win, loss, kind, red, disabled=False, href=None):
    # mat-board.tsx ClosestMatchCard: gap-2.5 (8.75) rounded-md border-hairline bg-surface-2 px-3 py-3 (10.5);
    # row gap-3 (10.5); name heading 14; facts mono 11 ink-2 mt-0.5 (1.75); stakes mono-bold 11 ink-2 uppercase;
    # CTA h-11 (38.5) rounded-sm px-4 (14) heading 12 uppercase caps; disabled opacity .6
    label = f"Challenge {name}" if kind == "challenge" else "Go live to roll"
    fill = f"background: {CTA}; color: {ON_CTA}" if red else f"border: 1px solid {HLS}; color: {INK}"
    btn_style = (f"{fill}; height: 38.5px; box-sizing: border-box; border-radius: 3px; padding: 0 14px; display: flex; "
                 f"align-items: center; justify-content: center; {'opacity: 0.6;' if disabled else ''}")
    btn_inner = f'<span style="{H7}; font-size: 12px; line-height: 16px; {UP}; letter-spacing: 1.12px">{label}</span>'
    if href and not disabled:
        btn = f'<a href="{href}" aria-label="{label}" style="{btn_style}">{btn_inner}</a>'
    else:
        btn = f'<button type="button" disabled="" aria-label="{label}" style="{BTN_RESET}; {btn_style}">{btn_inner}</button>'
    return (f'<section style="display: flex; flex-direction: column; gap: 8.75px; border-radius: 4px; border: 1px solid {HL}; '
            f'background: {S2}; padding: 10.5px">{section_label("Closest match", "You 1487")}'
            f'<div style="display: flex; align-items: center; gap: 10.5px; color: {INK}">'
            f'{avatar32(name)}<span style="flex: 1; display: flex; flex-direction: column">'
            f'<span style="{H7}; font-size: 14px; line-height: 18px; color: {INK}">{name}</span>'
            f'<span style="margin-top: 1.75px; {M4}; font-size: 11px; line-height: 14px; color: {INK2}; {TAB}">{elo} · {gap} vs you · {lbs} lbs</span>'
            f'<span style="margin-top: 1.75px; {M7}; font-size: 11px; line-height: 14px; color: {INK2}; {UP}; {TAB}">Win {win} · Loss {loss}</span>'
            f'</span></div>{btn}</section>')


ROSTER = [  # closest first by |gap| vs 1487 (lib/arena/mat-board.ts sortByEloGap)
    ("Dana Okafor", 1512, "+25", 168, True),
    ("Leo Tanaka", 1440, "−47", 175, True),
    ("Priya Shah", 1395, "−92", 135, False),
    ("Sam Whitfield", 1620, "+133", 185, True),
    ("Jordan Cruz", 1301, "−186", 160, True),
]


def spoken_gap(gap):
    # mat-board.tsx spokenGap: "plus 25" / "minus 47" / "even"
    if gap.startswith("+"):
        return f"plus {gap[1:]}"
    if gap.startswith("−"):
        return f"minus {gap[1:]}"
    return "even"


def mat_row(name, elo, gap, lbs, action):
    # mat-board.tsx MatRow: min-h-[48px] border-b hairline border-l-2 positive py-1.5 (5.25) pl-2 (7) gap-3 (10.5);
    # name heading 13; meta mono 11 ink-2 (gap mono-bold ink-2) mt-0.5; actions gap-2 (7)
    return (f'<div style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; gap: 10.5px; '
            f'border-bottom: 1px solid {HL}; border-left: 2px solid {POS}; padding: 5.25px 0 5.25px 7px">'
            f'<a href="36-Athlete.dc.html" aria-label="{name}, ELO {elo}, {spoken_gap(gap)} vs you, {lbs} pounds" style="flex: 1; min-width: 0; display: flex; '
            f'align-items: center; gap: 10.5px; color: {INK}">{avatar32(name)}<span style="flex: 1; min-width: 0; display: flex; flex-direction: column">'
            f'<span style="{H7}; font-size: 13px; line-height: 17px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{name}</span>'
            f'<span style="margin-top: 1.75px; {M4}; font-size: 11px; line-height: 14px; color: {INK2}; {TAB}; white-space: nowrap">{elo} · '
            f'<span style="{M7}; color: {INK2}">{gap}</span> · {lbs} lbs</span></span></a>'
            f'<div style="flex-shrink: 0; display: flex; align-items: center; gap: 7px">{action}</div></div>')


def just_rolled():
    # mat-board.tsx JustRolled gap-1.5 (5.25) + lib/arena/mat-board.ts formatJustRolled: "W def. L · Method · age"
    lines = ["Sam Whitfield def. Jordan Cruz · Submission · 3h",
             "Leo Tanaka drew Priya Shah · Draw · 1d",
             "Marcus Reyes def. Dana Okafor · Submission · 2d",
             "Leo Tanaka def. Jordan Cruz · Submission · 5d"]
    body = "".join(f'<span style="{M4}; font-size: 11px; line-height: 14px; color: {INK2}; {TAB}; white-space: nowrap">{t}</span>' for t in lines)
    return f'<section style="display: flex; flex-direction: column; gap: 5.25px">{section_label("Just rolled")}{body}</section>'


def arena_screen(live, waiting=False):
    if waiting:
        # header-chip-model.ts "waiting": ● WAITING · <NAME> · m:ss; the name alone truncates to fit the 160pt cap
        chip_args = ("live", "WAITING · DANA… · 9:12", "Live status: waiting for Dana Okafor, 9 minutes 12 seconds left", False)
    else:
        chip_args = CHIP_LIVE if live else CHIP_OFFLINE
    parts = []
    if waiting:
        # WaitingStrip / StripShell: min-h-[48px] rounded-xs border-hairline bg-surface-2 py-1.5 pl-3 pr-2
        # (5.25 / 10.5 / 7) border-l-[3px] ink-3, gap-3; head mono-bold 11 ink uppercase
        parts.append(
            f'<div style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; gap: 10.5px; border-radius: 2px; '
            f'border: 1px solid {HL}; border-left: 3px solid {INK3}; background: {S2}; padding: 5.25px 7px 5.25px 10.5px">'
            f'<span aria-label="Waiting for Dana Okafor, 9 minutes 12 seconds left" style="flex: 1; {M7}; font-size: 11px; line-height: 14px; '
            f'color: {INK}; {UP}; {TAB}; white-space: nowrap">Waiting · Dana Okafor · 9:12</span>'
            f'{outline_action("Cancel", "Cancel challenge", href="13-Arena-Live.dc.html")}</div>')
        parts.append(closest_card("Leo Tanaka", 1440, "−47", 175, "+14", "−18", "challenge", red=False, disabled=True))
    elif live:
        parts.append(closest_card("Dana Okafor", 1512, "+25", 168, "+17", "−15", "challenge", red=True, href="14-Arena-Waiting.dc.html"))
    else:
        parts.append(closest_card("Dana Okafor", 1512, "+25", 168, "+17", "−15", "go-live", red=True, href="13-Arena-Live.dc.html"))

    rows = []
    for name, elo, gap, lbs, ranked in ROSTER:
        if waiting and name == "Dana Okafor":
            act = f'<span style="{M7}; font-size: 11px; line-height: 14px; color: {INK3}; {UP}; {TAB}; white-space: nowrap">Sent 9:12</span>'
        elif not ranked:
            act = meta_tag("Casual only")
        elif not live:
            act = outline_action("Roll", f"Go live to challenge {name}", dim=True, href="13-Arena-Live.dc.html")
        elif waiting:
            act = outline_action("Roll", f"Challenge {name}", disabled=True)
        else:
            act = outline_action("Roll", f"Challenge {name}", href="14-Arena-Waiting.dc.html")
        rows.append(mat_row(name, elo, gap, lbs, act))
    parts.append(f'<section>{section_label("On the mat · closest first", "5")}{"".join(rows)}</section>')
    parts.append(just_rolled())

    # PageContainer (inline paddingHorizontal 16) + contentContainerStyle paddingTop 12, paddingBottom 24, gap 16
    body = (tab_header("Arena", chip_args) + control_bar(live) +
            f'<main style="flex: 1 1 auto; min-height: 0; overflow: hidden; box-sizing: border-box; padding: 12px 16px 24px; '
            f'display: flex; flex-direction: column; gap: 16px">{keep(parts)}</main>' +
            tab_bar("Arena", arena_dot=live))
    return body


def build_arena():
    write("12-Arena-Offline.dc.html", "Arena: offline", arena_screen(False), 844)
    write("13-Arena-Live.dc.html", "Arena: live", arena_screen(True), 844)
    write("14-Arena-Waiting.dc.html", "Arena: waiting", arena_screen(True, waiting=True), 850)


# ---------------------------------------------------------------- Challenge prompt sheet (over live Home)

def mono_caps(text, color, size=10, bold=False, spacing=2.52):
    # fight-ui.tsx Mono: mono-medium (or bold), default 10 / 2.52 tracking, tabular
    return (f'<span style="{M7 if bold else M5}; font-size: {size}px; line-height: {round(size * 1.3)}px; letter-spacing: {spacing}px; '
            f'color: {color}; {TAB}; white-space: nowrap">{text}</span>')


def challenge_sheet():
    # components/arena/challenge-prompt-sheet.tsx (all inline styles: literal values)
    header = (f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">'
              f'{mono_caps("INCOMING CHALLENGE", INK3, bold=True)}'
              f'<div style="display: flex; align-items: center; gap: 10px">{mono_caps("9:42 LEFT", INK, size=13, bold=True, spacing=0.5)}'
              f'<span style="height: 24px; box-sizing: border-box; padding: 0 8px; display: flex; align-items: center; border: 1px solid {HLS}; '
              f'border-radius: 2px">{mono_caps("RANKED", INK2)}</span></div></div>')
    who = (f'<div style="display: flex; align-items: center; gap: 16px">'
           f'<div aria-hidden="true" style="width: 88px; height: 88px; box-sizing: border-box; flex-shrink: 0; display: flex; align-items: center; '
           f'justify-content: center; background: {S4}; border: 1px solid {HLS}; border-radius: 2px; {H7}; font-size: 30px; letter-spacing: 1px; '
           f'color: {INK}">DO</div><div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px">'
           f'<span style="{DISPLAY}; font-size: 44px; line-height: 42px; color: {INK}; white-space: nowrap">D. Okafor</span>'
           f'<span style="{M4}; font-size: 13px; line-height: 17px; color: {INK2}; {TAB}">ELO 1512 · 168 LBS</span>'
           f'<span style="{B4}; font-size: 13px; line-height: 17px; color: {INK2}">D. Okafor is live in the Arena</span></div></div>')
    # calculate_elo_stakes(1487, 1512, 170, 168): win +17, draw -7, loss -15 (same weight division, K 32)
    cells = [("WIN", "▲ +17", "WIN +17", POS), ("DRAW", "▼ −7", "DRAW -7", AMBER), ("LOSS", "▼ −15", "LOSS -15", NEG)]
    cell_html = "".join(
        f'<div aria-label="{aria}" style="flex: 1; display: flex; flex-direction: column; align-items: center; '
        f'justify-content: center; gap: 5px; {"" if i == 0 else f"border-left: 1px solid {HL};"}">{mono_caps(lab, INK3)}'
        f'<span style="{M7}; font-size: 16px; line-height: 20px; color: {col}; {TAB}">{val}</span></div>'
        for i, (lab, val, aria, col) in enumerate(cells))
    stakes = (f'<div style="display: flex; flex-direction: column; gap: 8px">{mono_caps("YOUR STAKES · 1487", INK3)}'
              f'<div style="height: 64px; box-sizing: border-box; display: flex; background: {S1}; border: 1px solid {HL}; border-radius: 3px">'
              f'{cell_html}</div></div>')
    btn_text = f"{H7}; font-size: 14px; line-height: 18px; {UP}; letter-spacing: 1.12px"
    buttons = (f'<div style="display: flex; flex-direction: column; gap: 4px"><div style="display: flex; gap: 12px">'
               f'<a href="Main.dc.html" aria-label="Decline challenge" style="flex: 1 1 0; height: 56px; box-sizing: border-box; display: flex; '
               f'align-items: center; justify-content: center; border-radius: 3px; border: 1px solid {HLS}; color: {INK}">'
               f'<span style="{btn_text}">Decline</span></a>'
               f'<a href="21-Faceoff-Weight.dc.html" aria-label="Accept challenge" style="flex: 2 1 0; height: 56px; display: flex; align-items: center; '
               f'justify-content: center; border-radius: 3px; background: {CTA}; color: {ON_CTA}"><span style="{btn_text}">Accept</span></a></div>'
               f'<button type="button" aria-label="Later" style="{BTN_RESET}; height: 44px; display: flex; align-items: center; justify-content: center">'
               f'<span style="{H7}; font-size: 14px; line-height: 18px; color: {INK2}; text-decoration: underline">Later</span></button></div>')
    # gorhom handle area (indicator opacity 0) ~24pt, then content: paddingHorizontal 16, paddingTop 8, paddingBottom 34, gap 16.
    # No backdropComponent is passed, so the screen behind is NOT dimmed.
    return (f'<div role="dialog" aria-modal="true" aria-label="Incoming challenge" style="position: absolute; left: 0; right: 0; bottom: 0; '
            f'background: {S3}; border-top: 1px solid {HLS}; border-radius: 8px 8px 0 0">'
            f'<div aria-hidden="true" style="height: 24px"></div>'
            f'<div style="padding: 8px 16px 34px; display: flex; flex-direction: column; gap: 16px">{header}{who}{stakes}{buttons}</div></div>')


def build_challenge_sheet():
    # bell badge = fresh incoming challenges + unseen reels (1); Arena tab = red count of fresh incoming (1)
    body = (brand_header(CHIP_LIVE, bell_count=1) +
            home_scroll([welcome(), elo_hero(), arena_nudge(live=True), recent_activity()]) +
            tab_bar("Home", arena_count=1) + challenge_sheet())
    write("15-Challenge-Sheet.dc.html", "Challenge prompt", body, 844)


# ---------------------------------------------------------------- Rankings

def rank_row(rank, name, sub, value, leader=False, you=False):
    # elo-system/rank-row.tsx: gap-3 (10.5) border-l-[3px]; you: bg-surface-2 px-5 py-4 (17.5 / 14) border-t hairline-strong;
    # else bg-surface-3 px-4 py-3 (14 / 10.5). rank mono-bold 16 w36 right (leader text-cta); name heading 15; sub body 11 ink-3;
    # value mono-bold 28 lh 34; delta=0 -> DeltaNumber muted em-dash only (size s: glyph 10px, lh 12)
    bg = f"background: {S2}; padding: 14px 17.5px; border-top: 1px solid {HLS}" if you else f"background: {S3}; padding: 10.5px 14px"
    return (f'<a href="36-Athlete.dc.html" aria-label="{name}, rank {rank}, ELO {value}" style="display: flex; align-items: center; gap: 10.5px; {bg}; '
            f'border-left: 3px solid {CTA if leader else "transparent"}; color: {INK}; flex-shrink: 0">'
            f'<span style="width: 36px; flex-shrink: 0; text-align: right; {M7}; font-size: 16px; line-height: 20px; '
            f'color: {CTA_TEXT if leader else INK2}">{rank:02d}</span>'
            f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column">'
            f'<span style="{H7}; font-size: 15px; line-height: 19px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{name}</span>'
            f'<span style="margin-top: 2px; {B4}; font-size: 11px; line-height: 14px; color: {INK3}; white-space: nowrap">{sub}</span></span>'
            f'<span style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px">'
            f'<span style="{M7}; font-size: 28px; line-height: 34px; color: {INK}">{value}</span>'
            f'<span aria-hidden="true" style="{M7}; font-size: 10px; line-height: 12px; color: {INK3}">{EM_DASH}</span></span></a>')


def build_rankings():
    rows = [(1, "Rafael Moura", "Atos Austin", 1688), (2, "Sam Whitfield", "Free agent", 1620),
            (3, "Tomas Lindqvist", "Atos Austin", 1598), (4, "Andre Coelho", "Free agent", 1571),
            (5, "Kenji Mori", "Atos Austin", 1554), (6, "Eli Brandt", "Free agent", 1532),
            (7, "Owen Hale", "Atos Austin", 1519)]
    lst = "".join(rank_row(r, n, s, v, leader=(r == 1)) for r, n, s, v in rows)
    # leaderboard/index.tsx: chip strip px-4 py-3 (14 / 10.5) border-b hairline-faint, gap 8 (style);
    # MetaTag row px-4 pt-3 pb-2 (14 / 10.5 / 7); fighters-list.tsx FlatList padding 12 / top 4 / gap 1 (style)
    body = (brand_header(CHIP_OFFLINE) +
            f'<div style="flex-shrink: 0; padding: 10.5px 14px; border-bottom: 1px solid {HLF}; display: flex; flex-direction: column; gap: 8px">'
            f'<div style="display: flex; flex-wrap: wrap; gap: 8px">{chip("Fighters", True)}{chip("Gyms", False)}</div>'
            f'<div style="display: flex; flex-wrap: wrap; gap: 8px">{chip("All", False)}{chip("Male", True)}{chip("Female", False)}</div></div>'
            f'<div style="flex-shrink: 0; padding: 10.5px 14px 7px; display: flex">{meta_tag("38 Athletes · Live")}</div>'
            f'<main style="flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 4px 12px 0; display: flex; flex-direction: column; gap: 1px">{lst}</main>'
            + rank_row(12, "Marcus Reyes · You", "Atos Austin", 1487, you=True) +
            tab_bar("Rankings"))
    write("16-Rankings.dc.html", "Rankings", body, 844)


# ---------------------------------------------------------------- Profile

def stat_tile(label, value, color=INK, big=True):
    if big:  # profile-quick-stats.tsx StatTile: px-4 py-4 (14), value mono-bold 28 / lh 34, mt-2 (7)
        pad, size, lh, mt = "14px", 28, 34, 7
    else:  # profile/stats.tsx StatTile: px-3 py-3 (10.5), value mono-bold 22 / lh 26, mt-1 (3.5)
        pad, size, lh, mt = "10.5px", 22, 26, 3.5
    return (f'<div style="flex: 1 1 0; min-width: 0; background: {S3}; border: 1px solid {HL}; border-radius: 4px; padding: {pad}; '
            f'display: flex; flex-direction: column; align-items: center">'
            f'<span style="{M7}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 2.52px; white-space: nowrap">{label}</span>'
            f'<span style="{M7}; font-size: {size}px; line-height: {lh}px; margin-top: {mt}px; color: {color}; {TAB}">{value}</span></div>')


RECENT = [  # (opponent, relative date, ranked delta or None for casual)
    ("Dana Okafor", "2d ago", 18),
    ("Jordan Cruz", "6d ago", 9),
    ("Priya Shah", "1w ago", None),
    ("Sam Whitfield", "2w ago", -10),
    ("Leo Tanaka", "3w ago", -9),
]


def delta_signed(v, size=16):
    # DeltaNumber showSign size m (16, lh 19): "+18" / "-10", positive / negative
    col = POS if v > 0 else NEG if v < 0 else INK3
    txt = f"+{v}" if v > 0 else str(v)
    return f'<span style="{M7}; font-size: {size}px; line-height: {round(size * 1.2)}px; color: {col}; {TAB}">{txt}</span>'


def participant_row(name, when, delta):
    # participant-row.tsx (pressable): bg-surface-3 border-hairline-faint rounded-xs px-4 py-3 (14 / 10.5) gap-3 (10.5);
    # name heading 12; subtitle mono 12 ink-3 mt-[2px]; history-row-action.tsx gap-2 (7): delta (ranked only) + ChevronRight 16 ink-2
    d = delta_signed(delta) if delta is not None else ""
    return (f'<a href="32-Match-Detail.dc.html" aria-label="Open match vs {name}" style="display: flex; align-items: center; gap: 10.5px; '
            f'background: {S3}; border: 1px solid {HLF}; border-radius: 2px; padding: 10.5px 14px; color: {INK}">'
            f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column">'
            f'<span style="{H7}; font-size: 12px; line-height: 16px; color: {INK}">vs {name}</span>'
            f'<span style="margin-top: 2px; {M4}; font-size: 12px; line-height: 16px; color: {INK3}">{when}</span></span>'
            f'<span style="display: flex; align-items: center; gap: 7px">{d}{icon("chevron-right", 16, INK2)}</span></a>')


def highlight_tile(opp, secs):
    # profile/highlight-tile.tsx: 96 x 171 (9:16), bg-surface-4 rounded-md; duration badge bottom-1 left-1 (3.5)
    # bg-surface-2 rounded-xs px-1 (3.5) mono 10 ink tabular
    return (f'<a href="34-Highlight-Viewer.dc.html" aria-label="Highlight vs {opp}, {secs} seconds" style="position: relative; flex-shrink: 0; '
            f'width: 96px; height: 171px; border-radius: 4px; overflow: hidden; background: {S4}; display: flex; align-items: center; '
            f'justify-content: center; color: {INK}"><span style="{M7}; font-size: 9px; letter-spacing: 1.6px; color: {INK3}">POSTER</span>'
            f'<span style="position: absolute; bottom: 3.5px; left: 3.5px; background: {S2}; border-radius: 2px; padding: 0 3.5px; {M4}; '
            f'font-size: 10px; line-height: 14px; color: {INK}; {TAB}">{secs}s</span></a>')


def film_poster(opp_short, opp_full, letter, line, date, line_color):
    # film-room/poster-card.tsx compact (120 wide, 3:4), poster present: still + bottom scrim (0 -> .88 over 58%),
    # READY outline badge top/right 8, W tag (h20 rounded 2, border green, tag fill .45 black), name heading 13 caps,
    # data line mono-bold 11 in outcome colour, date mono-medium 10 text2 (all inline: literal)
    return (f'<a href="32-Match-Detail.dc.html" aria-label="Open match video vs {opp_full}" style="position: relative; flex-shrink: 0; width: 120px; '
            f'height: 160px; box-sizing: border-box; overflow: hidden; border-radius: 3px; border: 1px solid {HL}; background: {S3}; color: #FFFFFF">'
            f'<span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; '
            f'padding-bottom: 40px; {M7}; font-size: 9px; letter-spacing: 1.6px; color: {INK3}">OPENING STILL</span>'
            f'<span aria-hidden="true" style="position: absolute; left: 0; right: 0; bottom: 0; height: 58%; '
            f'background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.88))"></span>'
            f'<span style="position: absolute; top: 8px; right: 8px; height: 20px; box-sizing: border-box; padding: 0 7px; display: flex; '
            f'align-items: center; border-radius: 2px; background: rgba(0,0,0,.88); border: 1px solid rgba(255,255,255,.40); {M7}; font-size: 9px; '
            f'letter-spacing: 1.6px; color: #E8EDF2">READY</span>'
            f'<span style="position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; flex-direction: column; gap: 6px">'
            f'<span style="display: flex; align-items: center; gap: 7px; min-width: 0">'
            f'<span style="height: 20px; min-width: 20px; box-sizing: border-box; padding: 0 5px; border-radius: 2px; border: 1px solid {POS}; '
            f'background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; {M7}; font-size: 11px; color: {POS}">{letter}</span>'
            f'<span style="flex: 1; min-width: 0; {H7}; font-size: 13px; line-height: 17px; {UP}; letter-spacing: 0.52px; color: #FFFFFF; '
            f'white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{opp_short}</span></span>'
            f'<span style="display: flex; align-items: center; justify-content: space-between; gap: 6px; overflow: hidden">'
            f'<span style="{M7}; font-size: 11px; line-height: 14px; letter-spacing: 0.4px; color: {line_color}; {TAB}; white-space: nowrap; '
            f'flex-shrink: 0">{line}</span>'
            f'<span style="{M5}; font-size: 10px; line-height: 13px; letter-spacing: 1.2px; color: rgba(232,237,242,.72); {TAB}; '
            f'white-space: nowrap; flex-shrink: 0">{date}</span></span></span></a>')


def theme_switcher():
    # account-section.tsx ThemeSwitcherRow: px-4 h-12 (14 / 42); Palette 16 mr-3 (10.5); segmented rounded-xs border-hairline-strong;
    # px-2.5 py-1.5 (8.75 / 5.25); icon 12; label mono-bold 10 ml-1 (3.5) uppercase caps-l; active bg-surface-4 ink, else bg-surface-3 ink-3
    opts = [("sun", "Light", False), ("moon", "Dark", False), ("monitor", "System", True)]
    segs = "".join(
        f'<button type="button" aria-label="{lab} theme" aria-pressed="{"true" if on else "false"}" style="{BTN_RESET}; display: flex; '
        f'align-items: center; padding: 5.25px 8.75px; background: {S4 if on else S3}">{icon(ic, 12, INK if on else INK3)}'
        f'<span style="margin-left: 3.5px; {M7}; font-size: 10px; line-height: 13px; {UP}; letter-spacing: 1.68px; color: {INK if on else INK3}">{lab}</span></button>'
        for ic, lab, on in opts)
    return (f'<div style="height: 42px; box-sizing: border-box; padding: 0 14px; display: flex; align-items: center; justify-content: space-between">'
            f'<span style="display: flex; align-items: center"><span style="margin-right: 10.5px">{icon("palette", 16, INK)}</span>'
            f'<span style="{H7}; font-size: 12px; line-height: 16px; color: {INK}; {UP}; letter-spacing: 1.12px">Theme</span></span>'
            f'<span style="display: flex; border-radius: 2px; overflow: hidden; border: 1px solid {HLS}">{segs}</span></div>')


def settings_row(label, href, ic=None, destructive=False):
    # account-section.tsx SettingsRow: px-4 h-12 (14 / 42) border-t hairline-faint; icon 16 mr-3 (10.5); heading 12 uppercase caps;
    # destructive text-cta
    ic_html = f'<span style="margin-right: 10.5px">{icon(ic, 16, INK)}</span>' if ic else ""
    return (f'<a href="{href}" style="height: 42px; box-sizing: border-box; padding: 0 14px; display: flex; align-items: center; '
            f'border-top: 1px solid {HLF}; color: {INK}">{ic_html}<span style="{H7}; font-size: 12px; line-height: 16px; {UP}; '
            f'letter-spacing: 1.12px; color: {CTA_TEXT if destructive else INK}">{label}</span></a>')


def build_profile():
    # profile-header.tsx: items-center gap-3 (10.5); avatar h-20 w-20 (70) rounded-md bg-surface-3 border-hairline, initials
    # mono-bold 24 caps; name block gap-1 (3.5); meta mono 10 ink-3 caps-xl joined "  ·  "; ELO block gap-2 (7) w-full;
    # tile px-6 py-5 (21 / 17.5); value mono-bold 72 / lh 86 / ls -2.8, mt-2 (7); "Peak" mono 10 ink-3 caps-l mt-2
    header = (f'<section style="display: flex; flex-direction: column; align-items: center; gap: 10.5px">'
              f'<div aria-hidden="true" style="width: 70px; height: 70px; box-sizing: border-box; border-radius: 4px; background: {S3}; '
              f'border: 1px solid {HL}; display: flex; align-items: center; justify-content: center; {M7}; font-size: 24px; letter-spacing: 1.12px; color: {INK}">MR</div>'
              f'<div style="display: flex; flex-direction: column; align-items: center; gap: 3.5px">'
              f'<h1 style="margin: 0; {H7}; font-size: 24px; line-height: 30px; color: {INK}">Marcus Reyes</h1>'
              f'<span style="{M4}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 2.52px; text-align: center; '
              f'white-space: pre">Atos Austin  ·  170 lbs  ·  M</span></div>'
              f'<div style="align-self: stretch; background: {S3}; border: 1px solid {HL}; border-radius: 4px; padding: 17.5px 21px; display: flex; '
              f'flex-direction: column; align-items: center">'
              f'<span style="{M7}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 2.52px">ELO Rating</span>'
              f'<span style="{M7}; font-size: 72px; line-height: 86px; letter-spacing: -2.8px; margin-top: 7px; color: {INK}; {TAB}">1487</span>'
              f'<span style="margin-top: 7px; {M4}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 1.68px">Peak 1502</span></div></section>')
    # ShareProfileButton: gap-2 (7) bg-surface-3 border-hairline-strong rounded-sm px-5 py-3 (17.5 / 10.5); ArrowUpRight 16 ink-2
    share = (f'<button type="button" aria-label="Share profile" style="{BTN_RESET}; display: flex; align-items: center; justify-content: center; gap: 7px; '
             f'background: {S3}; border: 1px solid {HLS}; border-radius: 3px; padding: 10.5px 17.5px">{icon("arrow-up-right", 16, INK2)}'
             f'<span style="{H7}; font-size: 12px; line-height: 16px; color: {INK}; {UP}; letter-spacing: 1.12px">Share profile</span></button>')
    quick = (f'<section style="display: flex; flex-direction: column; gap: 10.5px">'
             f'<div style="display: flex; gap: 10.5px">{stat_tile("Matches", "21")}{stat_tile("Win Rate", "70%")}</div>'
             f'<div style="display: flex; gap: 10.5px">{stat_tile("Streak", "3")}{stat_tile("Best", "5")}{stat_tile("ELO/Mo", "+34", POS)}</div></section>')
    recent = (f'<section style="display: flex; flex-direction: column; gap: 10.5px">{meta_tag("Recent Matches")}'
              f'<div style="display: flex; flex-direction: column; gap: 1px">{"".join(participant_row(*r) for r in RECENT)}</div></section>')
    # highlights-row.tsx: gap-3 (10.5); horizontal row bleeds (marginHorizontal -16, paddingHorizontal 16, gap 8)
    highlights = (f'<section style="display: flex; flex-direction: column; gap: 10.5px">{meta_tag("Highlights")}'
                  f'<div style="margin: 0 -16px; padding: 0 16px; display: flex; gap: 8px; overflow: hidden">'
                  f'{highlight_tile("Dana Okafor", 28)}{highlight_tile("Jordan Cruz", 21)}{highlight_tile("Sam Whitfield", 34)}{highlight_tile("Leo Tanaka", 19)}</div></section>')
    # film-room-preview.tsx: gap-3; entry row gap-3 bg-surface-3 border-hairline-faint rounded-xs px-4 py-3; title heading 14 caps;
    # sub body 12 ink-3; posters row gap 12, paddingHorizontal 16, marginHorizontal -16 (inline)
    film = (f'<section style="display: flex; flex-direction: column; gap: 10.5px">{meta_tag("Film Room")}'
            f'<a href="31-Film-Room.dc.html" aria-label="Open Film Room" style="display: flex; align-items: center; gap: 10.5px; background: {S3}; '
            f'border: 1px solid {HLF}; border-radius: 2px; padding: 10.5px 14px; color: {INK}"><span style="flex: 1; min-width: 0; display: flex; flex-direction: column">'
            f'<span style="{H7}; font-size: 14px; line-height: 18px; color: {INK}; {UP}; letter-spacing: 1.12px">Film Room</span>'
            f'<span style="{B4}; font-size: 12px; line-height: 16px; color: {INK3}">Every match, its film and the breakdown.</span></span>'
            f'{icon("chevron-right", 16, INK2)}</a>'
            f'<div style="margin: 0 -16px; padding: 0 16px; display: flex; gap: 12px; overflow: hidden">'
            f'{film_poster("D. Okafor", "Dana Okafor", "W", "▲ +18 · 04:12", "SEP 27", POS)}'
            f'{film_poster("J. Cruz", "Jordan Cruz", "W", "▲ +9 · 06:00", "SEP 23", POS)}'
            f'{film_poster("P. Shah", "Priya Shah", "W", "CASUAL · 02:47", "SEP 21", POS)}</div></section>')
    # "View Detailed Stats": bg-surface-3 border-hairline-strong rounded-sm px-5 py-4 (17.5 / 14), in a gap-2 wrapper
    stats_btn = (f'<a href="18-Profile-Stats.dc.html" style="background: {S3}; border: 1px solid {HLS}; border-radius: 3px; padding: 14px 17.5px; '
                 f'display: flex; justify-content: center; color: {INK}"><span style="{H7}; font-size: 12px; line-height: 16px; {UP}; '
                 f'letter-spacing: 1.12px">View Detailed Stats</span></a>')
    account = (f'<section style="display: flex; flex-direction: column; gap: 10.5px">{meta_tag("Account")}'
               f'<div style="background: {S3}; border: 1px solid {HL}; border-radius: 4px; overflow: hidden">{theme_switcher()}'
               f'{settings_row("Edit Profile", "07-Setup-Who.dc.html", "user-pen")}'
               f'{settings_row("Settings &amp; Privacy", "43-Settings.dc.html", "settings")}'
               f'{settings_row("Sign Out", "02-Login.dc.html", destructive=True)}</div></section>')
    # footer: items-center gap-1 (3.5) py-2 (7); app-version-label.tsx mono 9 ink-3 caps
    footer = (f'<footer style="display: flex; flex-direction: column; align-items: center; gap: 3.5px; padding: 7px 0">'
              f'<span style="{M4}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 1.68px">ELO RATED Beta</span>'
              f'<span style="{M4}; font-size: 9px; line-height: 12px; color: {INK3}; letter-spacing: 1.12px">v0.4.0 (23) · Embedded</span></footer>')
    # PageContainer: paddingHorizontal 16 + contentContainerStyle paddingTop 24, gap 24
    body = (tab_header("Profile", CHIP_OFFLINE) +
            f'<main style="flex: 1 1 auto; min-height: 0; overflow: hidden; box-sizing: border-box; padding: 24px 16px 0; display: flex; '
            f'flex-direction: column; gap: 24px">'
            + keep([header, share, quick, recent, highlights, film,
                    f'<div style="display: flex; flex-direction: column; gap: 7px">{stats_btn}</div>', account, footer])
            + '</main>' +
            tab_bar("Profile"))
    write("17-Profile.dc.html", "Profile", body, PROFILE_H)


# ---------------------------------------------------------------- Profile stats

HISTORY = [  # opponent, relative date, type, outcome, ranked delta
    ("Dana Okafor", "2d ago", "Ranked", "win", 18),
    ("Jordan Cruz", "6d ago", "Ranked", "win", 9),
    ("Priya Shah", "1w ago", "Casual", "win", None),
    ("Sam Whitfield", "2w ago", "Ranked", "loss", -10),
    ("Leo Tanaka", "3w ago", "Ranked", "draw", -9),
    ("Dana Okafor", "1mo ago", "Ranked", "loss", -16),
]


def outcome_tag(o):
    # elo-system/outcome-tag.tsx: px-2 py-1 (7 / 3.5) border rounded-xs min-w-[36px]; mono-bold 10 uppercase caps-l
    border, color = {"win": (POS, POS), "loss": (NEG, NEG), "draw": (HLS, INK3)}[o]
    return (f'<span aria-label="{o}" style="min-width: 36px; box-sizing: border-box; padding: 3.5px 7px; border: 1px solid {border}; '
            f'border-radius: 2px; display: flex; align-items: center; justify-content: center; {M7}; font-size: 10px; line-height: 13px; '
            f'{UP}; letter-spacing: 1.68px; color: {color}">{o[0].upper()}</span>')


def match_card(opp, when, mtype, outcome, delta):
    # components/match-card.tsx: gap-3 bg-surface-3 border-hairline-faint rounded-xs px-4 py-3; h-9 w-9 (31.5) initials square
    # bg-surface-4 border-hairline-strong; name heading 14; subtitle mono 11 ink-3 "date · Ranked" mt-[2px];
    # right gap-2 ml-2 (7): delta mono-bold 16, OutcomeTag, ChevronRight 16 ink-2
    ini = "".join(w[0] for w in opp.split()).upper()[:2]
    d = ""
    if delta is not None:
        col = POS if delta > 0 else NEG if delta < 0 else INK3
        d = f'<span style="{M7}; font-size: 16px; line-height: 20px; color: {col}; {TAB}">{"+" if delta > 0 else ""}{delta}</span>'
    return (f'<a href="32-Match-Detail.dc.html" aria-label="Open match vs {opp}" style="display: flex; align-items: center; justify-content: space-between; '
            f'gap: 10.5px; background: {S3}; border: 1px solid {HLF}; border-radius: 2px; padding: 10.5px 14px; color: {INK}; flex-shrink: 0">'
            f'<span style="display: flex; align-items: center; gap: 10.5px; flex: 1; min-width: 0">'
            f'<span aria-hidden="true" style="width: 31.5px; height: 31.5px; box-sizing: border-box; flex-shrink: 0; border-radius: 2px; background: {S4}; '
            f'border: 1px solid {HLS}; display: flex; align-items: center; justify-content: center; {M7}; font-size: 10px; letter-spacing: 1.68px; color: {INK}">{ini}</span>'
            f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column">'
            f'<span style="{H7}; font-size: 14px; line-height: 18px; color: {INK}; white-space: nowrap">{opp}</span>'
            f'<span style="margin-top: 2px; {M4}; font-size: 11px; line-height: 14px; color: {INK3}; white-space: nowrap">{when} · {mtype}</span></span></span>'
            f'<span style="display: flex; align-items: center; gap: 7px; margin-left: 7px">{d}{outcome_tag(outcome)}{icon("chevron-right", 16, INK2)}</span></a>')


def plate_title(text, mb):
    return f'<h2 style="margin: 0 0 {mb}px; {H7}; font-size: 12px; line-height: 16px; color: {INK}; {UP}; letter-spacing: 1.12px">{text}</h2>'


def build_stats():
    # profile/stats.tsx StatsHeader: gap-4 (14) mb-2 (7); tiles row gap-3 (10.5)
    tiles = f'<div style="display: flex; gap: 10.5px">{stat_tile("ELO", "1487", big=False)}{stat_tile("Wins", "14", big=False)}{stat_tile("Win Rate", "70%", big=False)}</div>'
    # milestone-progress.tsx: Elite (1400) -> Champion (1500), "13 to Champion", 87%; mb-2 (7), bar h-1.5 (5.25), mt-2 (7)
    milestone = plate(
        f'<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px">'
        f'<span style="{H7}; font-size: 12px; line-height: 16px; color: {INK}; {UP}; letter-spacing: 1.12px">Elite</span>'
        f'<span style="{M4}; font-size: 10px; line-height: 13px; color: {INK3}; {UP}; letter-spacing: 1.68px; {TAB}">13 to Champion</span></div>'
        f'<div role="progressbar" aria-label="Progress to Champion" aria-valuenow="87" aria-valuemin="0" aria-valuemax="100" '
        f'style="height: 5.25px; border-radius: 2px; background: {S4}; overflow: hidden"><div style="height: 100%; width: 87%; background: {CTA}"></div></div>'
        f'<div style="display: flex; justify-content: space-between; margin-top: 7px">'
        f'<span style="{M4}; font-size: 10px; line-height: 13px; color: {INK3}; {TAB}">1400</span>'
        f'<span style="{M4}; font-size: 10px; line-height: 13px; color: {INK3}; {TAB}">1500</span></div>')
    # weekly-activity.tsx: title mb-3 (10.5); row items-end gap-1 (3.5) h-16 (56); column gap-1; bar area height 48 (style);
    # bar max(8, m/max*100)% bg-cta rounded-xs; week label mono 9 ink-3. queries.ts getWeeklyMatchActivity: rolling 7-day
    # windows back from now, each labelled by its window's Monday
    weeks = [("8/10", 1), ("8/17", 2), ("8/24", 1), ("8/31", 2), ("9/7", 2), ("9/14", 1), ("9/21", 1), ("9/28", 2)]
    mx = max(m for _, m in weeks)
    cols = "".join(
        f'<div style="flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 3.5px">'
        f'<div style="width: 100%; height: 48px; display: flex; flex-direction: column; justify-content: flex-end">'
        + (f'<div style="width: 100%; height: {max(8, round(m / mx * 100))}%; background: {CTA}; border-radius: 2px"></div>' if m else "")
        + f'</div><span style="{M4}; font-size: 9px; line-height: 12px; color: {INK3}; {TAB}">{w}</span></div>'
        for w, m in weeks)
    weekly = plate(plate_title("Weekly Activity", 10.5) +
                   f'<div style="display: flex; align-items: flex-end; gap: 3.5px; height: 56px">{cols}</div>')
    # submission-breakdown.tsx: title mb-3; list gap-3; row gap-1; name body 12 ink; W positive / L negative mono-bold 11; bar h-1.5
    subs = [("Armbar", 4, 1, 100), ("Rear Naked Choke", 3, 1, 80), ("Triangle Choke", 2, 2, 80), ("Heel Hook", 2, 1, 60), ("Guillotine", 2, 0, 40)]
    sub_rows = "".join(
        f'<div style="display: flex; flex-direction: column; gap: 3.5px"><div style="display: flex; align-items: center; justify-content: space-between">'
        f'<span style="{B4}; font-size: 12px; line-height: 16px; color: {INK}">{n}</span>'
        f'<span style="display: flex; align-items: center; gap: 3.5px"><span style="{M7}; font-size: 11px; line-height: 14px; color: {POS}; {TAB}">{w}W</span>'
        f'<span style="{M4}; font-size: 11px; color: {INK3}">·</span><span style="{M7}; font-size: 11px; line-height: 14px; color: {NEG}; {TAB}">{l}L</span></span></div>'
        f'<div style="height: 5.25px; border-radius: 2px; background: {S4}; overflow: hidden"><div style="height: 100%; width: {p}%; background: {CTA}"></div></div></div>'
        for n, w, l, p in subs)
    top_subs = plate(plate_title("Top Submissions", 10.5) + f'<div style="display: flex; flex-direction: column; gap: 10.5px">{sub_rows}</div>')
    wld = (f'<span style="display: flex; align-items: center; gap: 7px">'
           f'<span style="{M7}; font-size: 11px; line-height: 14px; color: {INK}; {TAB}">14W</span><span style="{M4}; font-size: 11px; color: {INK3}">·</span>'
           f'<span style="{M7}; font-size: 11px; line-height: 14px; color: {NEG}; {TAB}">6L</span><span style="{M4}; font-size: 11px; color: {INK3}">·</span>'
           f'<span style="{M4}; font-size: 11px; line-height: 14px; color: {INK3}; {TAB}">1D</span></span>')
    filt = (f'<div style="display: flex; align-items: center; justify-content: space-between">'
            f'<div style="display: flex; gap: 7px">{chip("All", True)}{chip("Ranked", False)}</div>{wld}</div>')
    head = (f'<div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 7px">{tiles}{milestone}{weekly}{top_subs}{filt}'
            f'{meta_tag("Match History")}</div>')
    cards = "".join(match_card(*m) for m in HISTORY)
    # FlatList contentContainerStyle: padding 16, gap 8 (style)
    body = (app_header("Stats", "17-Profile.dc.html") +
            f'<main style="flex: 1 1 auto; min-height: 0; overflow: hidden; box-sizing: border-box; padding: 16px; display: flex; '
            f'flex-direction: column; gap: 8px">{keep([head])}{cards}</main>' + tab_bar("Profile"))
    write("18-Profile-Stats.dc.html", "Profile stats", body, 1300)


# Profile's full scroll measures ~2010px; the canvas board is 1500 (override with PROFILE_H=2010 after resizing the board).
PROFILE_H = int(os.environ.get("PROFILE_H", "2010"))
HOME_RESUME_ITEMS = 4

if __name__ == "__main__":
    build_home()
    build_home_resume()
    build_arena()
    build_challenge_sheet()
    build_rankings()
    build_profile()
    build_stats()
    print("ok")
