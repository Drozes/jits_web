"""Designer B2: timekeeper mode (flag ON) boards B6 to B11, plus the optional flag-OFF board C1, for the
canvas page "Proposed (Oct 15 Timekeeper)" on "ELO RATED Native Screens".

Static markup only: this script writes .dc.html files; nothing in the boards is script-built.

Usage:
  python3 gen_b2.py              # writes project/P-TK-B6..B11, P-TK-C1 and boards_b2.json (heights from the last run)
  python3 gen_b2.py --measure    # also measures each board in headless Chrome and writes the measured heights

Sources of truth:
  Spec and copy: SPEC.md and COPY-DECK.md in this folder (2026-10-15). SPEC and COPY-DECK copy wins;
          every new string carries its TK-* id in the frame notes, shipped strings are the code literals.
  Look:   the live "Current app" boards 21, 22, 22b, 23, 24, 25, 26 and 27 (canvas version 1792079812-15a6,
          read 2026-10-15) and apps/mobile/components/match-flow (faceoff/*, live/*, steps/*), so the
          timekeeper screens extend the same frame, top bar, fight chip, plates, clock and buttons.
  Layout: the same row-of-phones board as gen_a.py (Designer A) so the page reads as one set:
          48 px padding, 40 px gap, 390 x 844 dark phone frames with a caption block under each.
  Tokens: apps/mobile/lib/tokens.ts (dark) and onMediaTokens. NativeWind rem = 14 px.
Sample data: M. Reyes (challenger, 1512, 172.5 LBS), D. Okafor (opponent, 1487, 171.4 LBS), J. Cruz
(timekeeper). Picker roster as Designer B1 (gen_b1.py): Jordan Cruz (J. Cruz) 1301, Sam Whitfield 1620,
Priya Shah 1455, Leo Tanaka 1440 (L. Tanaka, the replacement timekeeper on B9), Kenji Mori 1388.
Illustrative extra: P. Lam (phase 2 invitee).
No em dashes anywhere.
"""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "project")
os.makedirs(OUT, exist_ok=True)
BANNED = (chr(0x2014), chr(0x2013), chr(0x2015))

# ---- tokens (dark), apps/mobile/lib/tokens.ts ----
VOID, PANEL, PLATE, BRIGHT = "#0D0F14", "#13151B", "#1E222B", "#262A34"
INK, INK2, INK3 = "#E8EDF2", "#9CA3AF", "#8D929D"
RED, NEG, AMBER, GREEN = "#E63946", "#EC6A74", "#F59E0B", "#22C55E"
HL, HLF, HLS = "rgba(107,114,128,0.45)", "rgba(107,114,128,0.20)", "rgba(107,114,128,0.62)"
AMBER_RULE = "rgba(245,158,11,0.7)"
NEG_RULE = "rgba(236,106,116,0.7)"
# onMediaTokens (BROADCAST aliases)
OM_INK, OM_INK3, OM_CHIP, OM_CHIP_B = "#0D0F14", "#575C68", "rgba(232,235,240,0.96)", "rgba(13,15,20,0.34)"
OM_RED_INK, OM_SLAB, OM_DIM, OM_TEXT2 = "#AC2B34", "rgba(13,15,20,0.92)", "rgba(232,237,242,0.62)", "rgba(232,237,242,0.72)"
OM_STRONG, OM_GLASS, OM_TAGSOFT, OM_TAGTEXT = "rgba(255,255,255,0.40)", "rgba(255,255,255,0.12)", "rgba(0,0,0,0.40)", "rgba(255,255,255,0.85)"
MONO, DM, INTER, BEBAS = "'JetBrains Mono', monospace", "'DM Sans', sans-serif", "'Inter', sans-serif", "'Bebas Neue', sans-serif"
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'

PAD, GAP = 48, 40
PHONE_W, PHONE_H = 390, 844
TAG_ON = "TIMEKEEPER MODE (FLAG ON)"

# ---- sample data ----
A = {"init": "MR", "short": "M. Reyes", "full": "Marcus Reyes", "elo": "1512", "w": "172.5"}
B = {"init": "DO", "short": "D. Okafor", "full": "Dana Okafor", "elo": "1487", "w": "171.4"}
TK, TK2 = "J. Cruz", "L. Tanaka"

# ---- lucide icons (24 grid, stroke 2) ----
I = {
    "chev_l": '<path d="m15 18-6-6 6-6"></path>',
    "chev_r": '<path d="m9 18 6-6-6-6"></path>',
    "check": '<path d="M20 6 9 17l-5-5"></path>',
    "pause": '<rect x="14" y="3" width="5" height="18" rx="1"></rect><rect x="5" y="3" width="5" height="18" rx="1"></rect>',
    "play": '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>',
    "square": '<rect width="18" height="18" x="3" y="3" rx="2"></rect>',
    "timer": '<line x1="10" x2="14" y1="2" y2="2"></line><line x1="12" x2="15" y1="14" y2="11"></line><circle cx="12" cy="14" r="8"></circle>',
    "search": '<path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle>',
    "userplus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" x2="19" y1="8" y2="14"></line><line x1="22" x2="16" y1="11" y2="11"></line>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    "flag": '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"></path>',
    "loader": '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    "msg": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>',
    "mail": '<rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>',
    "video": '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path><rect x="2" y="6" width="14" height="12" rx="2"></rect>',
    "upload": '<path d="M12 3v12"></path><path d="m17 8-5-5-5 5"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>',
    "x": '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
}


def ic(name, size=16, color="currentColor", sw=2, style=""):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: block; flex-shrink: 0{"; " + style if style else ""}">{I[name]}</svg>')


def q(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace("'", "&#39;")


# ---- text atoms ----
def mono(t, size=10, color=INK3, w=500, ls=1.68, caps=True, extra=""):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<span style="font-family: {MONO}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.3)}px; letter-spacing: {ls}px; '
            f'font-variant-numeric: tabular-nums; {tt}color: {color}; white-space: nowrap{"; " + extra if extra else ""}">{q(t)}</span>')


def body(t, size=13, color=INK2, w=400, extra=""):
    return f'<span style="font-family: {INTER}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.35)}px; color: {color}{"; " + extra if extra else ""}">{q(t)}</span>'


def heading(t, size=16, color=INK, caps=False, ls=0.56, extra="", tag="span"):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<{tag} style="margin: 0; font-family: {DM}; font-weight: 700; font-size: {size}px; line-height: {round(size * 1.3)}px; letter-spacing: {ls}px; '
            f'{tt}color: {color}{"; " + extra if extra else ""}">{q(t)}</{tag}>')


def chip(t, color=AMBER, border=AMBER_RULE, bg="transparent"):
    return (f'<span style="display: inline-flex; align-items: center; height: 22px; box-sizing: border-box; padding: 0 8px; border: 1px solid {border}; border-radius: 2px; background: {bg}; '
            f'font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; text-transform: uppercase; color: {color}; white-space: nowrap">{q(t)}</span>')


def big_tag(t, color=AMBER, border=AMBER):
    """The prominent board tag (PHASE 2, OPTIONAL)."""
    return (f'<span style="display: inline-flex; align-items: center; height: 40px; box-sizing: border-box; padding: 0 16px; border: 2px solid {border}; border-radius: 3px; '
            f'font-family: {MONO}; font-weight: 700; font-size: 16px; letter-spacing: 3px; text-transform: uppercase; color: {color}; white-space: nowrap">{q(t)}</span>')


def row(inner, gap=8, align="center", justify="flex-start", extra=""):
    return f'<div style="display: flex; flex-direction: row; align-items: {align}; justify-content: {justify}; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


def col(inner, gap=8, extra=""):
    return f'<div style="display: flex; flex-direction: column; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


def spacer():
    return '<div style="flex: 1"></div>'


# ---- app chrome (from boards 21, 22, 22b, 25, 26, 27) ----
def screen(inner, gap=16, bg=VOID, pad="55px 16px 66px 16px"):
    return (f'<div style="position: absolute; inset: 0; box-sizing: border-box; background: {bg}; padding: {pad}; display: flex; flex-direction: column; gap: {gap}px">'
            f'{inner}</div>')


def topbar(label, leave=True, right=""):
    lv = (f'<a href="#" aria-label="Leave" style="height: 44px; display: flex; flex-direction: row; align-items: center; gap: 6px; color: {INK}">{ic("chev_l", 18, INK)}'
          f'<span style="font-family: {DM}; font-weight: 700; font-size: 13px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}; white-space: nowrap">Leave</span></a>') if leave else ""
    return (f'<div style="height: 44px; display: flex; flex-direction: row; align-items: center; flex-shrink: 0">'
            f'<div style="flex: 1; min-width: 88px; display: flex; align-items: center">{lv}</div>'
            f'<div style="flex-shrink: 1; min-width: 0">{mono(label, 10, INK3, 700, 2.52)}</div>'
            f'<div style="flex: 1; min-width: 88px; display: flex; align-items: center; justify-content: flex-end">{right}</div></div>')


def fight_chip(you=True, h=64, on_media=False, me="A", sub="full"):
    """FaceoffChip. `me` goes left; you=True adds the red 4 px you-mark. sub: full (ELO and weight), elo, none."""
    bg, bd, ink, ink3, vs = (OM_CHIP, OM_CHIP_B, OM_INK, OM_INK3, OM_RED_INK) if on_media else (PLATE, HLS, INK, INK3, NEG)
    L, R = (A, B) if me == "A" else (B, A)
    dot = f'<span style="width: 4px; height: 4px; background: {RED}; flex-shrink: 0"></span>' if you else ""
    pl = "11px" if you else "0"
    nm = lambda t: f'<span style="font-family: {DM}; font-weight: 700; font-size: 16px; line-height: 21px; letter-spacing: 0.56px; text-transform: uppercase; color: {ink}; white-space: nowrap">{q(t)}</span>'
    def meta(p):
        if sub == "none":
            return ""
        t = f'ELO {p["elo"]}' if sub == "elo" else f'{p["elo"]} · {p["w"]} LBS'
        return f'<span style="font-family: {MONO}; font-weight: 400; font-size: 11px; line-height: 14px; font-variant-numeric: tabular-nums; color: {ink3}">{t}</span>'
    return (f'<div style="height: {h}px; flex-shrink: 0; box-sizing: border-box; display: flex; flex-direction: row; background: {bg}; border: 1px solid {bd}; border-radius: 3px">'
            f'<div style="flex: 1; min-width: 0; padding-left: 12px; display: flex; flex-direction: column; justify-content: center; gap: 5px">'
            f'{row(dot + nm(L["short"]), 7)}<span style="padding-left: {pl}">{meta(L)}</span></div>'
            f'<div style="width: 44px; display: flex; align-items: center; justify-content: center"><span style="font-family: {BEBAS}; font-size: 22px; line-height: 26px; color: {vs}">VS</span></div>'
            f'<div style="flex: 1; min-width: 0; padding-right: 12px; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 5px">'
            f'{nm(R["short"])}{meta(R)}</div></div>')


def plate(label, done, align="left", flex=True):
    """StatusPlate: done = ink check on hairline-strong; not done = amber dot on amber dashed."""
    j = "flex-start" if align == "left" else "flex-end"
    f = "flex: 1; min-width: 0; " if flex else ""
    if done:
        mark = f'<span style="font-family: {MONO}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK}">✓</span>'
        return (f'<div style="{f}height: 44px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; justify-content: {j}; gap: 8px; border: 1px solid {HLS}; border-radius: 3px">'
                f'{mark}{mono(label, 10, INK, 700, 1.68, True, "overflow: hidden; text-overflow: ellipsis")}</div>')
    return (f'<div style="{f}height: 44px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; justify-content: {j}; gap: 8px; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>{mono(label, 10, AMBER, 700, 1.68, True, "overflow: hidden; text-overflow: ellipsis")}</div>')


def mini(label, done):
    """A 24 px status tag for the timekeeper's athlete rows (same language as StatusPlate)."""
    if done:
        return (f'<span style="display: inline-flex; align-items: center; gap: 5px; height: 24px; box-sizing: border-box; padding: 0 7px; border: 1px solid {HLS}; border-radius: 2px">'
                f'{mono("✓", 10, INK, 700, 0)}{mono(label, 10, INK, 700, 1.68)}</span>')
    return (f'<span style="display: inline-flex; align-items: center; gap: 6px; height: 24px; box-sizing: border-box; padding: 0 7px; border: 1px dashed {AMBER}; border-radius: 2px">'
            f'<span style="width: 6px; height: 6px; border-radius: 3px; background: {AMBER}"></span>{mono(label, 10, AMBER, 700, 1.68)}</span>')


def btn(label, kind="primary", h=56, disabled=False, icon=None, flex=False, extra=""):
    if kind == "primary":
        st = f"background: {RED}; color: {VOID}; border: none"
        c = VOID
    else:
        st = f"background: {PLATE}; color: {INK}; border: 1px solid {HLS}"
        c = INK
    op = "; opacity: 0.5" if disabled else ""
    fl = "flex: 1; min-width: 0; " if flex else ""
    dis = ' disabled aria-disabled="true"' if disabled else ""
    return (f'<button type="button"{dis} style="margin: 0; {fl}height: {h}px; box-sizing: border-box; padding: 0 14px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; '
            f'border-radius: 3px; {st}; cursor: pointer; flex-shrink: 0{op}{"; " + extra if extra else ""}">{ic(icon, 16, c) if icon else ""}'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase; color: {c}; white-space: nowrap">{q(label)}</span></button>')


def text_btn(label, color=NEG):
    return (f'<button type="button" style="margin: 0; height: 44px; padding: 0 4px; border: none; background: transparent; cursor: pointer; display: flex; align-items: center; '
            f'font-family: {DM}; font-weight: 700; font-size: 13px; letter-spacing: 1.12px; text-transform: uppercase; color: {color}">{q(label)}</button>')


def hold_line(t, color=INK2):
    return f'<div style="display: flex; justify-content: center">{mono(t, 10, color, 500, 2.52)}</div>'


def notice(t, tone=AMBER):
    """The shipped amber dashed Notice (alert) row (22b)."""
    return (f'<div role="alert" style="min-height: 44px; box-sizing: border-box; padding: 10px 12px; display: flex; flex-direction: row; align-items: center; gap: 8px; border: 1px dashed {tone}; border-radius: 3px">'
            f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {tone}; flex-shrink: 0"></span>{body(t, 13, tone, extra="flex: 1")}</div>')


def record_panel(sub=None, on=True):
    s = mono(sub, 10, INK, 500, 2.52) if sub else ""
    knob = (f'<button type="button" role="switch" aria-checked="{"true" if on else "false"}" aria-label="Record from my phone" style="width: 51px; height: 31px; box-sizing: border-box; padding: 2px; border: none; border-radius: 16px; '
            f'background: {INK if on else BRIGHT}; display: flex; align-items: center; justify-content: {"flex-end" if on else "flex-start"}; cursor: pointer"><span style="width: 27px; height: 27px; border-radius: 14px; background: {VOID if on else INK3}"></span></button>')
    return (f'<div style="min-height: 56px; flex-shrink: 0; box-sizing: border-box; padding: 0 14px; display: flex; flex-direction: row; align-items: center; gap: 12px; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'<div style="flex: 1; display: flex; flex-direction: column; gap: 4px">{heading("Record from my phone", 13, INK, True, 1.12)}{s}</div>{knob}</div>')


def record_locked():
    """D12: the timekeeper's record row, locked on (TK-K9): shipped label, lock glyph, no switch."""
    return (f'<div aria-label="Record from my phone, always on" style="min-height: 56px; flex-shrink: 0; box-sizing: border-box; padding: 10px 14px; display: flex; flex-direction: row; align-items: center; gap: 12px; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'<div style="flex: 1; display: flex; flex-direction: column; gap: 4px">{heading("Record from my phone", 13, INK, True, 1.12)}{body("Timekeepers always record this match.", 12, INK2)}</div>'
            f'{ic("lock", 18, INK2)}</div>')


def upload_line(pct=64):
    return (f'<div role="progressbar" style="display: flex; flex-direction: column; gap: 6px; padding: 8px 0; flex-shrink: 0">'
            f'{row(ic("upload", 12, INK2) + mono("YOUR ANGLE: UPLOADING", 10, INK2, 500, 1.68, True, "flex: 1") + mono(f"{pct}%", 10, INK2, 700, 0), 7)}'
            f'<div style="height: 2px; background: {HLS}"><div style="height: 2px; width: {pct}%; background: {INK2}"></div></div></div>')


def camera_card():
    return (f'<div style="display: flex; flex-direction: column; gap: 7px; flex-shrink: 0">'
            f'<div style="width: 100%; aspect-ratio: 16 / 9; box-sizing: border-box; border: 1px solid {HLS}; border-radius: 4px; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">'
            f'{mono("Camera preview", 10, "rgba(232,237,242,0.35)", 500, 2)}</div>'
            f'{mono("Preview only. Recording starts with the match.", 10, INK3, 400, 1.68, True, "white-space: normal")}</div>')


def deadline_chip(t, urgent=False):
    """TK-W1, B1's look: PromptCountdown type (mono 13 bold) on an attention rule; signal red at 2:00 and under."""
    c, b = (NEG, RED) if urgent else (AMBER, AMBER_RULE)
    return (f'<span role="timer" style="display: inline-flex; align-items: center; gap: 6px; height: 28px; box-sizing: border-box; padding: 0 9px; border: 1px solid {b}; border-radius: 2px; flex-shrink: 0">'
            f'{ic("timer", 13, c)}<span style="font-family: {MONO}; font-weight: 700; font-size: 13px; line-height: 17px; letter-spacing: 0.5px; font-variant-numeric: tabular-nums; color: {c}; white-space: nowrap">CANCELS IN {t}</span></span>')


def tile(init, size=40, fs=13):
    return (f'<div aria-hidden="true" style="width: {size}px; height: {size}px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {BRIGHT}; '
            f'border: 1px solid {HLS}; border-radius: 2px; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: {fs}px; letter-spacing: 1.12px; color: {INK}">{init}</div>')


def toast(title, desc, tone=RED):
    return (f'<div role="status" style="display: flex; flex-direction: column; gap: 3px; background: {PLATE}; border: 1px solid {HLS}; border-left: 3px solid {tone}; border-radius: 4px; padding: 12px 14px; flex-shrink: 0">'
            f'{heading(title, 14, INK, False, 0)}{body(desc, 13, INK2)}</div>')


def under(inner_screen, alpha=0.35):
    """A dimmed screen under a sheet, alert or toast."""
    return (f'<div aria-hidden="true" style="position: absolute; inset: 0; opacity: {alpha}">{inner_screen}</div>'
            f'<div aria-hidden="true" style="position: absolute; inset: 0; background: rgba(0,0,0,0.55)"></div>')


def alert(title, msg, keep, act):
    return (f'<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center">'
            f'<div role="alertdialog" aria-label="{q(title)}" style="width: 270px; box-sizing: border-box; background: {PANEL}; border: 1px solid {HLS}; border-radius: 10px; overflow: hidden">'
            f'<div style="padding: 18px 16px 16px; display: flex; flex-direction: column; gap: 6px; text-align: center">{heading(title, 16, INK, False, 0)}{body(msg, 13, INK2)}</div>'
            f'<div style="display: flex; flex-direction: row; border-top: 1px solid {HL}">'
            f'<button type="button" style="flex: 1; height: 44px; margin: 0; border: none; background: transparent; cursor: pointer; font-family: {DM}; font-weight: 500; font-size: 15px; color: {INK}">{q(keep)}</button>'
            f'<button type="button" style="flex: 1; height: 44px; margin: 0; border: none; border-left: 1px solid {HL}; background: transparent; cursor: pointer; font-family: {DM}; font-weight: 700; font-size: 15px; color: {NEG}">{q(act)}</button>'
            f'</div></div></div>')


def arena_bg():
    """A stand-in for the Arena the athletes exit to (drawn on the Current app boards 12 and 13)."""
    return screen(f'<div style="height: 44px; display: flex; align-items: center">{mono("Arena (Current app 13)", 10, INK3, 700, 2.52)}</div>'
                  + "".join(f'<div style="height: 72px; flex-shrink: 0; border: 1px solid {HL}; border-radius: 3px; background: {PLATE}"></div>' for _ in range(5)))


def push_card(title, text, when="now"):
    """B4's push look (E·R glyph)."""
    return (f'<div style="background: rgba(38,42,52,0.92); border-radius: 18px; padding: 12px 14px; display: flex; flex-direction: row; gap: 10px; align-items: flex-start; flex-shrink: 0">'
            f'<span aria-hidden="true" style="width: 34px; height: 34px; border-radius: 8px; background: {VOID}; border: 1px solid {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: 12px; color: {INK}">E<span style="color: {RED}">·</span>R</span>'
            f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">{row(mono("ELO RATED", 10, INK2, 500, 1.12) + mono(when, 10, INK3, 400, 0, False), 6, "center", "space-between")}'
            f'{heading(title, 14, INK, False, 0)}{body(text, 13, INK)}</div></div>')


def lock_screen(inner):
    return (f'<div style="position: absolute; inset: 0; box-sizing: border-box; padding: 60px 12px 24px; background: linear-gradient(180deg, #1A1D25 0%, #0D0F14 100%); display: flex; flex-direction: column; gap: 10px">'
            f'<div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding-bottom: 20px">{mono("Thursday 15 October", 13, INK, 500, 0, False)}'
            f'<span style="font-family: {INTER}; font-weight: 500; font-size: 72px; line-height: 80px; color: {INK}">7:41</span></div>{inner}</div>')


def annot(t):
    """A board annotation inside a frame (never app copy)."""
    return mono(t, 9, INK3, 500, 1.4, True, "white-space: normal")


# ---- live broadcast (board 24, live/*) ----
def cam_bg():
    return (f'<div style="position: absolute; left: 0; top: 0; width: 390px; height: 693px; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">'
            f'{mono("Camera", 10, "rgba(232,237,242,0.35)", 500, 2)}</div>'
            f'<div style="position: absolute; left: 0; right: 0; top: 0; height: 133px; background: linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0))"></div>'
            f'<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 380px; background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.85))"></div>')


def rec_tally(t="REC 02:14"):
    return (f'<div style="height: 28px; box-sizing: border-box; padding: 0 10px; display: flex; flex-direction: row; align-items: center; gap: 7px; border-radius: 2px; background: {RED}">'
            f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {VOID}"></span>{mono(t, 11, VOID, 700, 1.68)}</div>')


def hud_tag(t):
    return (f'<span style="height: 28px; box-sizing: border-box; padding: 0 9px; display: inline-flex; align-items: center; border: 1px solid {OM_STRONG}; border-radius: 2px; background: {OM_TAGSOFT}">'
            f'{mono(t, 10, OM_TAGTEXT, 700, 1.68)}</span>')


def state_strip(left, right=None, amber=True):
    bg, lc, rc = (AMBER, OM_INK, OM_INK) if amber else (OM_SLAB, "#FFFFFF", OM_DIM)
    r = mono(right, 9, rc, 500, 2.0) if right else ""
    return (f'<div style="height: 32px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; '
            f'background: {bg}; border-top-left-radius: 4px; border-top-right-radius: 4px">{mono(left, 11, lc, 700, 2.52)}{r}</div>')


def athlete_bar(you=True, flat_top=False):
    rad = "" if flat_top else "border-top-left-radius: 4px; border-top-right-radius: 4px; "
    dot = f'<span role="img" aria-label="You" style="width: 4px; height: 4px; background: {RED}; flex-shrink: 0"></span>' if you else ""
    pl = "11px" if you else "0"
    nm = lambda t: f'<span style="font-family: {DM}; font-weight: 700; font-size: 16px; line-height: 18px; letter-spacing: 0.56px; color: {OM_INK}; white-space: nowrap">{q(t.upper())}</span>'
    mt = lambda p: f'<span style="font-family: {MONO}; font-size: 11px; line-height: 13px; letter-spacing: 0.56px; font-variant-numeric: tabular-nums; color: {OM_INK3}">{p["elo"]} · {p["w"]} LBS</span>'
    return (f'<div style="height: 56px; box-sizing: border-box; display: flex; flex-direction: row; background: {OM_CHIP}; border: 1px solid {OM_CHIP_B}; border-bottom: 0; {rad}">'
            f'<div style="flex: 1; min-width: 0; padding-left: 12px; display: flex; flex-direction: column; justify-content: center; gap: 4px">{row(dot + nm(A["full"]), 7)}<span style="padding-left: {pl}">{mt(A)}</span></div>'
            f'<div aria-hidden="true" style="width: 44px; display: flex; flex-direction: column; align-items: center; padding-top: 7px; gap: 3px"><span style="font-family: {BEBAS}; font-size: 22px; line-height: 19px; color: {OM_RED_INK}">VS</span>'
            f'<span style="width: 1px; flex-grow: 1; background: {RED}"></span></div>'
            f'<div style="flex: 1; min-width: 0; padding-right: 12px; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 4px">{nm(B["full"])}{mt(B)}</div></div>')


def clock_slab(label="LIVE", clock="02:46", of="OF 05:00"):
    lc = {"LIVE": GREEN, "PAUSED": AMBER, "TIME": AMBER, "FINAL": INK}[label]
    dot = f'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 3.5px; background: {lc}"></span>' if label == "LIVE" else ""
    return (f'<div style="height: 104px; position: relative; display: flex; align-items: center; justify-content: center; background: {OM_SLAB}; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px">'
            f'<div style="position: absolute; left: 12px; top: 10px; display: flex; flex-direction: row; align-items: center; gap: 6px">{dot}{mono(label, 10, lc, 700, 2.52)}</div>'
            f'<span style="position: absolute; right: 12px; top: 10px">{mono(of, 10, OM_DIM, 500, 1.68)}</span>'
            f'<span role="timer" style="padding-top: 22px; font-family: {MONO}; font-weight: 700; font-size: 88px; line-height: 80px; letter-spacing: -3.52px; font-variant-numeric: tabular-nums; color: {INK}">{clock}</span></div>')


def live_controls(paused=False):
    pr = ("RESUME", "play") if paused else ("PAUSE", "pause")
    return (f'<div style="height: 64px; display: flex; flex-direction: row; gap: 12px">'
            f'<button type="button" style="flex: 1; min-width: 0; height: 64px; margin: 0; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; border-radius: 3px; '
            f'border: 1px solid {OM_STRONG}; background: {OM_GLASS}; cursor: pointer; color: #FFFFFF">{ic(pr[1], 22, "#FFFFFF")}'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; color: #FFFFFF">{pr[0]}</span></button>'
            f'<a href="#" style="flex: 1.4; min-width: 0; height: 64px; position: relative; overflow: hidden; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; border-radius: 3px; background: {RED}; color: {VOID}">'
            f'{ic("square", 20, VOID)}<span style="font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; color: {VOID}; white-space: nowrap">HOLD TO END</span>'
            f'<span style="position: absolute; left: 12px; right: 12px; bottom: 10px; height: 2px; background: rgba(13,15,20,0.25)"></span></a></div>')


def runs_clock(name):
    """TK-L2: the read-only strip that replaces the athletes' pause and end controls (64 px, slab fill)."""
    return (f'<div role="status" style="height: 64px; box-sizing: border-box; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; border-radius: 3px; '
            f'background: {OM_SLAB}; border: 1px solid {OM_STRONG}">{ic("timer", 18, OM_TEXT2)}{mono(name + " RUNS THE CLOCK", 11, OM_TEXT2, 700, 2.52)}</div>')


def ended_plate(name, final="01:12", dur="05:00"):
    return (f'<div role="alert" style="background: {OM_CHIP}; border: 1px solid {OM_CHIP_B}; border-radius: 4px; padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 6px">'
            f'{mono("MATCH OVER", 9, OM_INK3, 700, 2.52)}'
            f'<span style="font-family: {BEBAS}; font-size: 40px; line-height: 38px; color: {OM_INK}">{q(name.upper())} ENDED THE MATCH</span>'
            f'{mono(f"FINAL CLOCK {final} OF {dur}", 10, OM_INK3, 500, 1.68)}</div>')


def live(hud_right="", strip=None, you=True, slab=("LIVE", "02:46"), bottom="", above="", tally="REC 02:14"):
    t = rec_tally(tally) if tally else "<span></span>"
    plates = (state_strip(*strip) if strip else "") + athlete_bar(you, bool(strip)) + clock_slab(*slab)
    return (cam_bg()
            + f'<div style="position: absolute; inset: 0; box-sizing: border-box; padding: 59px 16px 42px 16px; display: flex; flex-direction: column">'
            f'<div style="height: 28px; display: flex; flex-direction: row; align-items: center; justify-content: space-between">{t}{row(hud_right, 8)}</div>'
            f'{spacer()}<div style="display: flex; flex-direction: column; gap: 12px">{above}<div>{plates}</div>{bottom}</div></div>')


# ---- picker: the canonical look and roster are Designer B1's (gen_b1.py, boards B2 and B3) ----
# Mirrored by look, not imported (B1 is being edited concurrently). Roster: Jordan Cruz (J. Cruz, the
# timekeeper), Sam Whitfield, Priya Shah, Leo Tanaka, Kenji Mori.
def search_field():
    return (f'<div role="search" style="height: 44px; flex-shrink: 0; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; gap: 8px; background: {PLATE}; border: 1px solid {HLS}; border-radius: 3px">'
            f'{ic("search", 16, INK3)}<span style="font-family: {INTER}; font-size: 14px; color: {INK3}">Search friends and nearby</span></div>')


def section(t):
    return f'<h2 style="margin: 6px 0 0; font-family: {MONO}; font-weight: 400; font-size: 11px; line-height: 14px; text-transform: uppercase; letter-spacing: 1.68px; color: {INK3}">{q(t)}</h2>'


def initials(name):
    parts = name.replace(".", "").split()
    return f"{parts[0][0]}·{parts[-1][0]}"


def presence(kind):
    if kind == "live":
        return row(f'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 3.5px; background: {GREEN}; flex-shrink: 0"></span>' + mono("LIVE", 10, GREEN, 700, 2.52), 7)
    if kind == "online":
        return f'<span aria-label="Online" style="width: 7px; height: 7px; box-sizing: border-box; border-radius: 3.5px; border: 1.5px solid {GREEN}; flex-shrink: 0; display: block"></span>'
    return ""


def btn_outline_small(t, aria=None):
    a = f' aria-label="{q(aria)}"' if aria else ""
    return (f'<button type="button"{a} style="margin: 0; background: none; cursor: pointer; height: 32px; box-sizing: border-box; display: flex; align-items: center; border-radius: 2px; border: 1px solid {HLS}; padding: 0 12px; flex-shrink: 0">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 11px; line-height: 14px; text-transform: uppercase; letter-spacing: 1.12px; color: {INK}">{q(t)}</span></button>')


def person(name, elo, pres="", friend_of=None, action="ask", dim=False):
    fo = f'<span style="margin-top: 2px">{body(friend_of + chr(39) + "s friend", 12, INK3)}</span>' if friend_of else ""
    right = btn_outline_small("Ask", f"Ask {name} to timekeep") if action == "ask" else ""
    op = " opacity: 0.45;" if dim else ""
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10.5px; border-radius: 3px; background: {PANEL}; padding: 10.5px; flex-shrink: 0;{op}">'
            f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">'
            f'{mono(initials(name), 10, INK, 700, 1.68, False)}</span>'
            f'<span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column">{heading(name, 14, INK, False, 0, "white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}'
            f'{mono(f"{elo} ELO", 12, INK3, 400, 0, False)}{fo}</span>{presence(pres)}{right}</div>')


def phase2_chip():
    return (f'<span style="display: inline-flex; align-items: center; gap: 5px; height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; border: 1px solid {HLS}; background: {VOID}; '
            f'font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; text-transform: uppercase; color: {INK2}; white-space: nowrap">{ic("lock", 11, INK2)}PHASE 2</span>')


def invite_row(enabled=False):
    if not enabled:
        return (f'<div aria-disabled="true" style="display: flex; flex-direction: row; align-items: center; gap: 10.5px; border-radius: 3px; border: 1px dashed {HLS}; padding: 10.5px; opacity: 0.55; flex-shrink: 0">'
                f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; border-radius: 2px; border: 1px dashed {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">{ic("userplus", 15, INK2)}</span>'
                f'<span style="flex: 1; min-width: 0">{heading("Invite someone not on ELO RATED", 13, INK2, False, 0)}</span>{phase2_chip()}</div>')
    return (f'<a href="#" style="display: flex; flex-direction: row; align-items: center; gap: 10.5px; border-radius: 3px; border: 1px solid {HLS}; background: {PANEL}; padding: 10.5px; flex-shrink: 0; color: {INK}">'
            f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; border-radius: 2px; border: 1px dashed {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">{ic("userplus", 15, INK)}</span>'
            f'<span style="flex: 1; min-width: 0">{heading("Invite someone not on ELO RATED", 13, INK, False, 0)}</span>{chip("PHASE 2", AMBER, AMBER)}{ic("chev_r", 16, INK)}</a>')


def picker_head(deadline="9:12", urgent=False, me="A"):
    return (topbar("FACE-OFF · TIMEKEEPER") + fight_chip(you=True, me=me)
            + row(heading("Pick a timekeeper", 20, INK, False, 0, tag="h1") + deadline_chip(deadline, urgent), 10, "center", "space-between")
            + f'<p style="margin: -6px 0 0">{body("They start the match, run the clock and record the result. They can" + chr(39) + "t be either of you.", 13, INK2)}</p>')


def pending_card(title, sub):
    dot = f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>'
    t = row(dot + heading(title, 16, INK, False, 0), 9) if title else ""
    s_ = f'<p style="margin: 0">{body(sub, 13, INK2)}</p>' if title else row(dot + body(sub, 13, INK2), 9)
    return (f'<div role="status" style="flex-shrink: 0; box-sizing: border-box; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: {PLATE}; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'{t}{s_}{btn("Ask someone else", "secondary", 44)}</div>')


def approval_card():
    """Mirrors B1's approval card (B2 frame 5): TK-P25 headline, the candidate row, Not this one then Approve."""
    dot = f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>'
    return (f'<div role="alert" style="flex-shrink: 0; box-sizing: border-box; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: {PLATE}; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'{row(dot + heading(A["short"] + " picked " + TK + ". OK with you?", 16, INK, False, 0), 9, "flex-start")}'
            f'{person("Jordan Cruz", 1301, "live", action=None)}'
            f'<div style="display: flex; gap: 12px">{btn("Not this one", "secondary", 48, flex=True)}{btn("Approve", "primary", 48, flex=True)}</div></div>')


# ---- result screens (boards 25, 26, 27) ----
def winner_chip():
    return (f'<div style="height: 56px; flex-shrink: 0; box-sizing: border-box; padding: 0 6px 0 10px; display: flex; flex-direction: row; align-items: center; gap: 10px; background: {PLATE}; border: 1px solid {HLS}; border-radius: 3px">'
            f'{tile(A["init"], 36)}<div style="flex: 1; display: flex; flex-direction: column; gap: 4px">{mono("WINNER", 10, INK3, 500, 2.52)}{heading(A["short"], 16, INK, True)}</div>'
            f'{text_btn("Change")}</div>')


def sub_grid():
    tiles = ""
    for i, t in enumerate(["Rear Naked Choke", "Armbar", "Triangle Choke", "Guillotine Choke"]):
        on = i == 0
        tiles += (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="margin: 0; height: 54px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; '
                  f'background: {BRIGHT if on else PLATE}; border: 1px solid {HLS if on else HL}; border-radius: 3px; cursor: pointer; font-family: {DM}; font-weight: 700; font-size: 14px; color: {INK}; text-align: left">'
                  f'<span>{q(t)}</span>{ic("check", 16, INK) if on else ""}</button>')
    return (f'<div style="display: flex; flex-direction: column; gap: 10px">{mono("HOW DID IT END?", 11, INK2, 700, 2.52)}'
            f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">{tiles}</div></div>')


def finish_time():
    return (f'<div style="display: flex; flex-direction: column; gap: 8px">{mono("FINISH TIME", 11, INK2, 700, 2.52)}'
            f'<div style="height: 64px; box-sizing: border-box; padding: 0 14px; display: flex; flex-direction: row; align-items: center; gap: 12px; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 30px; font-variant-numeric: tabular-nums; color: {INK}">03:48</span>{mono("FROM MATCH CLOCK", 10, INK3, 500, 2.52)}</div></div>')


def facts_plate():
    return (f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; overflow: hidden; flex-shrink: 0">'
            f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))">'
            f'<div style="padding: 14px 12px; display: flex; flex-direction: column; gap: 8px">{mono("ENDED AT", 10, INK3, 500, 2.52)}{mono("03:48", 18, INK, 700, 0)}</div>'
            f'<div style="padding: 14px 12px; display: flex; flex-direction: column; gap: 8px; border-left: 1px solid {HL}">{mono("CLOCK", 10, INK3, 500, 2.52)}{mono("05:00", 18, INK, 700, 0)}</div></div>'
            f'<div style="padding: 12px; display: flex; flex-direction: row; justify-content: space-between; border-top: 1px solid {HL}">'
            f'{heading(A["short"] + " vs " + B["short"], 13, INK, True)}{mono(A["elo"] + " · " + B["elo"], 11, INK2, 500, 0)}</div></div>')


def verdict_plate(rating=True):
    rb = (f'<div style="border-top: 1px solid {HL}; padding: 12px"><div style="height: 64px; box-sizing: border-box; padding: 0 16px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; background: {PLATE}; border: 1px solid {HL}; border-radius: 4px">'
          f'<div style="display: flex; flex-direction: column; gap: 6px">{mono("YOUR RATING", 10, INK3, 500, 2.52)}{mono("1512 → 1526", 22, INK, 700, 0)}</div>{mono("▲ +14", 26, GREEN, 700, 0)}</div></div>') if rating else ""
    yw = mono("YOU WON", 11, INK2, 700, 1.68) if rating else ""
    return (f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; flex-shrink: 0"><div style="padding: 20px 16px; display: flex; flex-direction: column; gap: 12px">'
            f'{row(tile(A["init"]) + f"<div style=\"flex: 1\">{mono(chr(87) + 'INNER', 10, INK3, 500, 2.52)}</div>" + yw, 10)}'
            f'<span style="font-family: {BEBAS}; font-size: 60px; line-height: 56px; color: {INK}">{q(A["short"])} won</span>'
            f'{body("by Rear Naked Choke · 03:48", 16, INK2)}</div>{rb}</div>')


def status_rows(rows):
    out = ""
    for i, (who, st, tone) in enumerate(rows):
        bb = f"border-bottom: 1px solid {HL}; " if i < len(rows) - 1 else ""
        out += (f'<div style="height: 48px; box-sizing: border-box; padding: 0 14px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; {bb}">'
                f'{heading(who, 13, INK, True)}{mono(st, 11, tone, 700, 1.68)}</div>')
    return f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; flex-shrink: 0">{out}</div>'


# ---- the timekeeper's face-off parts (new, FE-5) ----
def tk_athlete(p, weighed, ready, verdict=None):
    """One athlete row on the timekeeper's face-off. verdict: None (not yet possible), 'ask', 'confirmed', 'flagged'."""
    tags = mini("WEIGHED IN" if weighed else "WEIGHING IN", weighed) + mini("READY" if ready else "NOT READY", ready)
    w = f'{p["w"]} LBS'
    top = (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 12px">{tile(p["init"], 44, 14)}'
           f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">{heading(p["short"], 16, INK, True)}'
           f'{row(mono(p["elo"], 11, INK3, 400, 0) + mono("·", 11, INK3, 400, 0) + f"<span style=\"font-family: {BEBAS}; font-size: 22px; line-height: 22px; color: {INK}\">{w}</span>", 7)}</div>'
           f'<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px">{tags}</div></div>')
    act = ""
    if verdict == "ask":
        act = row(btn("Confirm", "primary", 44, flex=True) + btn("Doesn't look right", "secondary", 44, flex=True, extra="flex: 1.5"), 8)
    elif verdict == "reask":
        act = (f'<div style="display: flex; justify-content: center">{mono(p["short"].upper() + " RE-WEIGHED AT 171.0 LBS", 11, INK, 700, 1.68)}</div>'
               + row(btn("Confirm", "primary", 44, flex=True) + btn("Doesn't look right", "secondary", 44, flex=True, extra="flex: 1.5"), 8))
    elif verdict == "confirmed":
        act = row(mini("CONFIRMED", True), 8)
    elif verdict == "flagged":
        act = row(mini("YOU FLAGGED", False) + spacer() + text_btn("Withdraw flag"), 8)
    sep = f'<div style="height: 1px; background: {HL}"></div>' if act else ""
    bd = f"1px dashed {AMBER}" if verdict == "flagged" else f"1px solid {HL}"
    return (f'<div style="flex-shrink: 0; box-sizing: border-box; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: {PLATE}; border: {bd}; border-radius: 3px">'
            f'{top}{sep}{act}</div>')


def tk_faceoff(rows, start_enabled=False, reason=None, starting=False, extra="", rec=None):
    if starting:
        foot = btn("Start match", "primary", 72, disabled=True) + hold_line("STARTING MATCH...", INK)
    else:
        foot = btn("Start match", "primary", 72, disabled=not start_enabled) + (hold_line(reason) if reason else "")
    return screen(topbar("FACE-OFF · TIMEKEEPER") + fight_chip(you=False) + rows + extra + (rec if rec is not None else record_locked()) + spacer()
                  + f'<div style="display: flex; flex-direction: column; gap: 10px; flex-shrink: 0">{foot}</div>', 14)


# ---- athlete face-off (C1, from boards 21 and 22) ----
def fight_card():
    def side(p, you, right):
        al = "flex-end" if right else "flex-start"
        bb = f"; border-bottom: 3px solid {RED}" if you else ""
        return (f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: {al}; gap: 10px">'
                f'<div aria-hidden="true" style="width: 100%; height: 176px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {PLATE}; border: 1px solid {HLS}; border-radius: 2px{bb}">'
                f'<span style="font-family: {BEBAS}; font-size: 64px; letter-spacing: 1.12px; color: {INK}">{p["init"]}</span></div>'
                f'{heading(p["short"], 16, INK, True)}{mono("ELO " + p["elo"], 12, INK2, 500, 0)}'
                f'<span style="font-family: {BEBAS}; font-size: 36px; line-height: 44px; color: {INK}">{p["w"]} LBS</span></div>')
    return (f'<div style="display: flex; flex-direction: row; align-items: flex-start; flex-shrink: 0">{side(A, True, False)}'
            f'<div style="width: 40px; height: 176px; display: flex; align-items: center; justify-content: center"><span style="font-family: {BEBAS}; font-size: 30px; color: {NEG}">VS</span></div>'
            f'{side(B, False, True)}</div>')


def gap_line():
    return (f'<div style="height: 32px; flex-shrink: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-top: 1px solid {HL}; border-bottom: 1px solid {HL}">'
            f'{mono("1.1 LBS APART · SAME DIVISION", 11, INK2, 500, 2.52)}</div>')


def stakes():
    cell = lambda k, v, c, first: (f'<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px{"" if first else "; border-left: 1px solid " + HL}">'
                                    f'{mono(k, 10, INK3, 500, 2.52)}{mono(v, 16, c, 700, 0)}</div>')
    return (f'<div style="height: 56px; flex-shrink: 0; box-sizing: border-box; display: flex; flex-direction: row; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'{cell("WIN", "▲ +14", GREEN, True)}{cell("DRAW", "▼ −2", AMBER, False)}{cell("LOSS", "▼ −18", NEG, False)}</div>')


# ---- board layout (same as gen_a.py) ----
def phone(inner, h=PHONE_H):
    return (f'<div style="width: {PHONE_W}px; height: {h}px; flex-shrink: 0; position: relative; overflow: hidden; border: 1px solid {HLS}; border-radius: 4px; box-sizing: content-box; background: {VOID}">'
            f'{inner}</div>')


def frame_cell(fr):
    who = chip(fr["who"], INK, HLS) if fr.get("who") else ""
    extra = "".join(fr.get("chips", []))
    notes = "".join(f'<p style="margin: 0">{body(n, 12, INK2)}</p>' for n in fr.get("notes", []))
    copy = mono("copy: " + fr["copy"], 10, INK3, 400, 0.4, False, "white-space: normal; overflow-wrap: anywhere") if fr.get("copy") else ""
    return (f'<div style="width: {PHONE_W + 2}px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0">'
            f'{phone(fr["inner"], fr.get("h", PHONE_H))}'
            f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 0 2px">'
            f'<div style="display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap">{mono(fr["step"], 11, INK, 700, 2.52)}{who}{extra}</div>'
            f'{heading(fr["title"], 15, INK, False, 0)}{notes}'
            f'<div style="padding-top: 6px; border-top: 1px solid {HLF}">{copy}</div></div></div>')


def header(tags, kicker, title, intro):
    return (f'<div style="padding: {PAD}px {PAD}px 0; display: flex; flex-direction: column; gap: 10px">'
            f'<div style="display: flex; flex-direction: row; gap: 12px; align-items: center; flex-wrap: wrap">{tags}{mono(kicker, 10, INK3)}</div>'
            f'<h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 32px; line-height: 40px; color: {INK}">{q(title)}</h1>'
            f'<p style="margin: 0; max-width: 1100px">{body(intro, 15, INK2)}</p></div>')


def bullets(items):
    return "".join(f'<div style="display: flex; flex-direction: row; gap: 10px; align-items: flex-start"><span style="width: 4px; height: 4px; margin-top: 8px; background: {INK3}; flex-shrink: 0"></span>{body(t, 13, INK2)}</div>' for t in items)


def row_board(tags, kicker, title, intro, frames, notes_title=None, notes=None):
    n = len(frames)
    w = PAD * 2 + n * (PHONE_W + 2) + (n - 1) * GAP
    cells = "".join(frame_cell(f) for f in frames)
    nb = ""
    if notes:
        nb = (f'<div style="padding: 8px {PAD}px {PAD}px; display: flex; flex-direction: column; gap: 8px; max-width: 1400px">'
              f'{heading(notes_title or "Notes", 15, INK, False, 0)}{bullets(notes)}</div>')
    inner = (header(tags, kicker, title, intro)
             + f'<div style="padding: 32px {PAD}px {PAD if not notes else 24}px; display: flex; flex-direction: row; gap: {GAP}px; align-items: flex-start">{cells}</div>' + nb)
    return w, inner


def on_tag():
    return chip(TAG_ON, AMBER, AMBER_RULE)


ASSUMPTION = chip("Coordinator assumption · pending owner (Q1)", NEG, NEG_RULE)
TKW = f"TIMEKEEPER ({TK})"
ATH = f"ATHLETE ({A['short']})"

BOARDS = []


def board(file, title):
    def deco(fn):
        BOARDS.append((file, title, fn))
        return fn
    return deco


# ================================================================ B6
@board("P-TK-B6-Timekeeper-Faceoff.dc.html", "Timekeeper face-off and Start")
def b6():
    r_wait = tk_athlete(A, False, False) + tk_athlete(B, False, False)
    r_conf = tk_athlete(A, True, True, "confirmed") + tk_athlete(B, True, False, "ask")
    r_flag = tk_athlete(A, True, True, "confirmed") + tk_athlete(B, True, False, "flagged")
    r_ok = tk_athlete(A, True, True, "confirmed") + tk_athlete(B, True, True, "confirmed")
    r_re = tk_athlete(A, True, False, "confirmed") + tk_athlete(B, True, False, "reask")
    countdown = (f'<div style="position: absolute; inset: 0; background: #000000">'
                 f'<div style="position: absolute; left: 0; top: 0; width: 390px; height: 693px; background: {BRIGHT}"></div>'
                 f'<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.55)"></div>'
                 f'<div style="position: absolute; left: 16px; right: 16px; top: 59px; height: 28px; display: flex; align-items: center">'
                 f'<div style="height: 28px; box-sizing: border-box; padding: 0 10px; display: flex; align-items: center; gap: 7px; border: 1px solid {RED}; border-radius: 2px; background: rgba(0,0,0,0.45)">'
                 f'<span style="width: 8px; height: 8px; box-sizing: border-box; border-radius: 4px; border: 1.5px solid #F0556B"></span>{mono("REC ARMS AT GO", 10, "#F0556B", 700, 1.68)}</div></div>'
                 f'<div role="timer" aria-label="Match starts in 2" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center">'
                 f'<span style="font-family: {BEBAS}; font-size: 240px; line-height: 240px; color: #FFFFFF">2</span></div>'
                 f'<div style="position: absolute; left: 48px; right: 48px; bottom: 166px; display: flex; flex-direction: column; align-items: center; gap: 12px">'
                 f'<div style="width: 100%; height: 3px; background: rgba(255,255,255,0.18)"><div style="width: 55%; height: 3px; background: {RED}"></div></div>'
                 f'{mono("SYNCED TO SERVER CLOCK · ALL PHONES", 10, OM_TEXT2, 500, 2.52)}</div>'
                 f'<div style="position: absolute; left: 16px; right: 16px; bottom: 60px">{fight_chip(you=False, h=56, on_media=True)}</div></div>')
    frames = [
        dict(step="B6 · 1", who=TKW, title="Both athletes weighing in; Start disabled",
             inner=tk_faceoff(r_wait, reason="WAITING FOR BOTH ATHLETES"),
             notes=["New screen (FE-5, faceoff/faceoff-timekeeper.tsx). Same frame, top bar and fight chip as the athletes' ready step, without the red you-dot: the timekeeper is not competing.",
                    "D12: the record row is locked on in every frame (shipped label, lock glyph, TK-K9, no switch). Athletes keep their optional switch.",
                    "One row per athlete: name, rating, the challenge weight, and two status tags (weigh-in, ready). Confirm and Doesn't look right appear once that athlete has weighed in."],
             copy="TK-K0 FACE-OFF · TIMEKEEPER; TK-K1 WEIGHING IN; TK-K3 NOT READY; TK-K6 Start match; TK-K7 WAITING FOR BOTH ATHLETES; TK-K9 Timekeepers always record this match.; shipped Leave, Record from my phone"),
        dict(step="B6 · 2", who=TKW, title="Confirming weights",
             inner=tk_faceoff(r_conf, reason="CONFIRM BOTH WEIGHTS"),
             notes=["M. Reyes is confirmed and ready; D. Okafor has weighed in and waits for the timekeeper's check, and has not tapped ready yet.",
                    "Reason priority under Start (resolved here): MATCH ON HOLD · WEIGHT CHECK first, then WAITING FOR YOUR CAMERA (D12), then CONFIRM BOTH WEIGHTS whenever a weigh-in is waiting on the timekeeper (their own next action), else WAITING FOR BOTH ATHLETES."],
             copy="TK-K2 WEIGHED IN; TK-K4 READY; TK-K5 CONFIRMED; TK-K8 CONFIRM BOTH WEIGHTS; shipped Confirm, Doesn't look right"),
        dict(step="B6 · 3", who=TKW, chips=[ASSUMPTION], title="Timekeeper flagged D. Okafor: match on hold",
             inner=tk_faceoff(r_flag, reason="MATCH ON HOLD · WEIGHT CHECK"),
             notes=["Coordinator assumption, pending owner (Q1): a timekeeper Doesn't look right blocks the start until that athlete re-weighs and the timekeeper confirms again, the same as today's athlete flag. The flag clears D. Okafor's ready (server side).",
                    "D. Okafor sees TK-F7 with the shipped re-weigh field (board B5, frame 5). Withdraw flag returns the row to Confirm / Doesn't look right."],
             copy="shipped YOU FLAGGED, Withdraw flag, MATCH ON HOLD · WEIGHT CHECK; TK-K3 NOT READY"),
        dict(step="B6 · 3b", who=TKW, title="D. Okafor re-weighed: needs re-confirm",
             inner=tk_faceoff(r_re, reason="CONFIRM BOTH WEIGHTS"),
             notes=["In timekeeper mode a re-weigh (for any reason, including an opponent's flag) voids every check whose subject is that athlete, the timekeeper's confirmation included, and clears both athletes' ready, server side (review M3). The row returns to Confirm / Doesn't look right with the shipped RE-WEIGHED AT line; M. Reyes keeps the timekeeper's confirmation but must tap ready again."],
             copy="shipped {OPP} RE-WEIGHED AT {w} LBS, Confirm, Doesn't look right; TK-K2, TK-K3, TK-K5, TK-K8"),
        dict(step="B6 · 4", who=TKW, title="All set: Start match enabled",
             inner=tk_faceoff(r_ok, start_enabled=True),
             notes=["Both athletes ready server side (mark_match_ready), both timekeeper confirmations present, no open flag: start_match accepts only the timekeeper (BE-4). The athletes' phones never auto-start in timekeeper mode."],
             copy="TK-K2, TK-K4, TK-K5, TK-K6 Start match; TK-K9 Timekeepers always record this match."),
        dict(step="B6 · 4b", who=TKW, chips=[chip("D12", AMBER, AMBER_RULE)], title="Camera permission denied: Start waits",
             inner=tk_faceoff(r_ok, reason="WAITING FOR YOUR CAMERA",
                              rec=(f'<div role="alert" style="flex-shrink: 0; box-sizing: border-box; padding: 12px; display: flex; flex-direction: column; gap: 10px; border: 1px dashed {AMBER}; border-radius: 3px">'
                                   f'{row(ic("video", 18, AMBER) + body("Allow camera access to timekeep. Your camera records the match.", 13, AMBER, extra="flex: 1"), 10, "flex-start")}'
                                   f'{btn("Open Settings", "secondary", 44)}</div>')),
             notes=["D12: the timekeeper must record. Without camera access (or without the timekeeper recording intent) Start stays disabled: start_match refuses with timekeeper_not_recording, and set_match_recording_intent refuses to turn the timekeeper's intent off (timekeeper_must_record). Both athletes are ready and confirmed here; only the camera blocks.",
                    "The server can verify the intent, not that the camera is actually rolling (spec B.9)."],
             copy="TK-K10 WAITING FOR YOUR CAMERA; TK-K11 Allow camera access to timekeep. Your camera records the match.; TK-K12 Open Settings"),
        dict(step="B6 · 5", who=TKW, title="Starting the match",
             inner=tk_faceoff(r_ok, starting=True),
             notes=["Tap: one start_match call from this phone only; the button holds the shipped STARTING MATCH... line until the DB moves to in_progress, then all three phones run the shared countdown."],
             copy="shipped STARTING MATCH..."),
        dict(step="B6 · 6", who="ALL THREE PHONES", title="Countdown, synced on all phones",
             inner=countdown,
             notes=["The shipped countdown (Current app 23) with the timekeeper-mode caption. REC ARMS AT GO shows on any phone that records, the timekeeper's included (D8). On the athletes' phones the chip keeps the you-dot; on the timekeeper's it has none (drawn here)."],
             copy="TK-L0 SYNCED TO SERVER CLOCK · ALL PHONES; shipped REC ARMS AT GO"),
    ]
    return row_board(on_tag(), "Spec B.3 · FE-5 · BE-4, BE-7", "Timekeeper face-off and Start",
                     "The timekeeper's own face-off: they see both athletes' weigh-in and ready state, confirm each athlete's weight (D5), and are the only one who can start the match (D4). Athletes keep their own weigh-in and the merged ready step (board B5).",
                     frames)


# ================================================================ B7
@board("P-TK-B7-Live.dc.html", "Live, three roles")
def b7():
    tk_kicker = hud_tag("YOU RUN THE CLOCK")
    frames = [
        dict(step="B7 · 1", who=TKW, title="Timekeeper, running",
             inner=live(hud_right=tk_kicker, you=False, bottom=live_controls(False)),
             notes=["The shipped live screen. The athlete bar shows both athletes with no you-dot. PAUSE / RESUME and HOLD TO END are the timekeeper's only (can_control_match, BE-5); HOLD TO END calls the new end_match_clock. D12: the timekeeper always records, so the REC tally is always on and there is no stop-recording control (the shipped flow has none for anyone)."],
             copy="TK-L1 YOU RUN THE CLOCK; shipped LIVE, PAUSE, HOLD TO END, REC {mm:ss}"),
        dict(step="B7 · 2", who=TKW, title="Timekeeper, paused",
             inner=live(hud_right=tk_kicker, strip=("PAUSED", "CAMERA STILL RECORDING"), you=False, slab=("PAUSED", "02:46"), bottom=live_controls(True)),
             notes=["pause_match from the timekeeper; every phone reads the pause from the DB, as today."],
             copy="TK-L1; shipped PAUSED · CAMERA STILL RECORDING, PAUSED, RESUME"),
        dict(step="B7 · 2b", who=TKW, chips=[chip("D12", AMBER, AMBER_RULE)], title="Timekeeper camera failed, clock keeps running",
             inner=live(hud_right=tk_kicker, you=False, tally="NO VIDEO", bottom=live_controls(False),
                        above=(f'<div role="alert" style="background: {OM_SLAB}; border: 1px dashed {AMBER}; border-radius: 4px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px">'
                               f'{row(ic("video", 16, AMBER) + mono("CAMERA STOPPED · KEEP RUNNING THE CLOCK", 10, AMBER, 700, 1.4, True, "white-space: normal"), 8)}'
                               f'<button type="button" style="margin: 0; height: 44px; border-radius: 3px; border: 1px solid {OM_STRONG}; background: {OM_GLASS}; cursor: pointer; font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase; color: #FFFFFF">Restart camera</button></div>')),
             notes=["The match continues: the clock and the controls stay. A restarted recording becomes a second clip, the gap is noted on the match (timekeeper_recording_gaps, from the client report), and the athletes' optional angles still count. A camera that never restarts does not stop the match."],
             copy="TK-L3 CAMERA STOPPED · KEEP RUNNING THE CLOCK; TK-L4 Restart camera; shipped NO VIDEO, LIVE, PAUSE, HOLD TO END"),
        dict(step="B7 · 3", who=ATH, title="Athlete, read-only",
             inner=live(you=True, bottom=runs_clock(TK.upper())),
             notes=["Same screen with the clock, REC tally and athlete bar, but no pause and no end. The strip sits where the controls were, so the clock does not move between modes. The athlete's camera records exactly as today (D8)."],
             copy="TK-L2 {NAME} RUNS THE CLOCK (J. CRUZ RUNS THE CLOCK)"),
        dict(step="B7 · 4", who=ATH, title="Athlete, paused by the timekeeper",
             inner=live(you=True, strip=("PAUSED", "CAMERA STILL RECORDING"), slab=("PAUSED", "02:46"), bottom=runs_clock(TK.upper())),
             notes=["The shipped paused strip and slab label; still no controls for the athlete."],
             copy="shipped PAUSED · CAMERA STILL RECORDING, PAUSED; TK-L2"),
        dict(step="B7 · 5", who=ATH, title="Athlete, after the timekeeper ended",
             inner=live(you=True, slab=("FINAL", "01:12"), above=ended_plate(TK, "01:12"), tally="SAVING VIDEO"),
             notes=["Hold to end on the timekeeper's phone calls the new server action end_match_clock (BE-5), which stamps ended_at and the final clock and leaves the status in_progress; the legacy end_match refuses timekeeper-mode matches (use_end_match_clock). The athletes' phones freeze on that DB change (not a broadcast) and show the shipped ended plate with the timekeeper's name, then the result waiting view (board B8, frame 2).",
                    "Server auto-end (review M2): if the timekeeper has not ended the clock at full time (start plus duration plus paused time), the per-minute sweep stamps ended_at; the athletes' phones already show TIME. The 10-minute result window starts at ended_at."],
             copy="shipped {NAME} ENDED THE MATCH (name = timekeeper), FINAL CLOCK {mm:ss} OF {mm:ss}, MATCH OVER, FINAL, SAVING VIDEO"),
    ]
    return row_board(on_tag(), "Spec B.4 · FE-6 · BE-5", "Live, three roles",
                     "The timekeeper runs the clock: pause, resume and end (end_match_clock) are theirs alone, and the server ends the clock at full time if they do not (D4). Athletes keep the live screen and their camera, with the controls replaced by a read-only strip.",
                     frames)


# ================================================================ B8
@board("P-TK-B8-Result.dc.html", "Result, three roles")
def b8():
    tk_form = screen(f'<div style="display: flex; flex-direction: column; gap: 10px">{mono("ENDED AT 03:48", 10, INK2, 500, 2.52)}'
                     f'{heading("Record result", 30, INK, True, 0.56, tag="h1")}</div>'
                     + winner_chip() + sub_grid() + finish_time() + btn("Record result", "primary", 56)
                     + row(f'<span style="width: 6px; height: 6px; border-radius: 3px; background: {INK}; flex-shrink: 0"></span>'
                           + mono(f"You're recording for {A['short']} and {B['short']}. They confirm it next.", 11, INK2, 500, 0.56, False, "white-space: normal"), 8, justify="center"), 18)
    waiting = screen(mono("MATCH OVER", 10, INK2, 500, 2.52)
                     + f'<div aria-live="polite" style="display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 0">{tile("JC", 96, 30)}'
                     f'<span style="max-width: 320px; text-align: center; font-family: {BEBAS}; font-size: 48px; line-height: 46px; color: {INK}">{q(TK)} is recording the result</span>'
                     f'<div aria-hidden="true" style="display: flex; gap: 8px">' + "".join(f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {INK}; opacity: {o}"></span>' for o in (1, 0.6, 0.3)) + '</div>'
                     f'{body("You&#39;ll confirm it in a moment.".replace("&#39;", chr(39)), 14, INK2, extra="text-align: center")}</div>'
                     + facts_plate(), 20)
    done = screen(f'<div style="display: flex; flex-direction: column; gap: 10px">{mono(A["short"] + " vs " + B["short"], 10, INK2, 500, 2.52)}'
                  f'{heading("Result recorded", 30, INK, True, 0.56, tag="h1")}'
                  f'{body(A["short"] + " and " + B["short"] + " confirm it next. Your rating isn&#39;t affected.".replace("&#39;", chr(39)), 14, INK2)}</div>'
                  + verdict_plate(rating=False)
                  + status_rows([(A["short"], "WAITING", AMBER), (B["short"], "D. OKAFOR CONFIRMED ✓", INK)])
                  + spacer() + upload_line(64) + body("Keep ELO RATED open until your film uploads.", 13, INK2) + btn("Done", "secondary", 56), 16)
    tk_page = screen(f'<div style="height: 44px; display: flex; align-items: center; gap: 6px">{ic("chev_l", 18, INK)}{mono("MATCH", 10, INK3, 700, 2.52)}</div>'
                     + annot("Match detail chrome as Current app 32; only the film block is new")
                     + fight_chip(you=False, sub="elo")
                     + verdict_plate(rating=False)
                     + (f'<div role="alert" style="flex-shrink: 0; box-sizing: border-box; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: {PLATE}; border: 1px dashed {AMBER}; border-radius: 3px">'
                        f'{row(ic("upload", 18, AMBER) + body("Your film hasn" + chr(39) + "t uploaded yet.", 14, AMBER, 500), 10)}{btn("Upload now", "primary", 48)}</div>'), 16)
    confirm = screen(f'<div style="display: flex; flex-direction: column; gap: 10px">{mono("RESULT RECORDED BY " + TK.upper(), 10, INK2, 500, 2.52)}'
                     f'{heading("Confirm result", 30, INK, True, 0.56, tag="h1")}</div>'
                     + verdict_plate(True)
                     + status_rows([(B["short"], "WAITING", AMBER), (A["short"] + " (you)", "WAITING ON YOU", AMBER)])
                     + f'<div style="display: flex; flex-direction: column; gap: 12px">{btn("Confirm result", "primary", 56, icon="check")}{btn("Dispute result", "secondary", 56, icon="flag")}'
                     f'<div style="display: flex; flex-direction: column; align-items: center; gap: 6px">{mono("If you leave without disputing, it counts as confirming.", 11, INK, 700, 0.56, False, "white-space: normal; text-align: center")}'
                     f'{mono("Locks automatically in 23 h.", 11, INK2, 400, 0.56, False)}</div></div>', 16)
    frames = [
        dict(step="B8 · 1", who=TKW, title="Timekeeper records the result",
             inner=tk_form,
             notes=["Straight from end to the shipped result form: no claim race, the timekeeper is the only recorder (record_match_result refuses anyone else with not_timekeeper, BE-6). The claim line is replaced by TK-R1.",
                    "Winner tiles read the athletes' names (no YOU / OPPONENT on this phone)."],
             copy="TK-R1 You're recording for {A} and {B}. They confirm it next.; shipped ENDED AT, Record result, WINNER, Change, HOW DID IT END?, FINISH TIME, FROM MATCH CLOCK"),
        dict(step="B8 · 2", who=ATH, title="Athlete waits; no take-over",
             inner=waiting,
             notes=["The shipped waiting view with the timekeeper as the recorder. Timekeeper mode never offers Record it myself, even after 20 s of silence.",
                    "No result within 10 minutes of the end (offline or stalled timekeeper; no Leave is offered after the end): the match is not cancelled, it goes to admin review and this view shows TK-D8 (board B9, frame 7)."],
             copy="shipped MATCH OVER, {name} is recording the result, You'll confirm it in a moment., ENDED AT, CLOCK"),
        dict(step="B8 · 3", who=TKW, title="Timekeeper done, confirm progress",
             inner=done,
             notes=["record_match_result in timekeeper mode writes no confirmation row for anyone. The rows follow the athletes' confirmations live; Done exits to the Arena (the timekeeper can never confirm or dispute).",
                    "Shown mid-way: D. Okafor has confirmed, M. Reyes has not.", "D12: the timekeeper's upload is required, so the done screen carries the shipped upload line and the shipped keep-open line."],
             copy="TK-R2 Result recorded; TK-R3 {A} and {B} confirm it next. Your rating isn't affected.; TK-R4 Done; shipped WAITING, {OPP} CONFIRMED ✓, WINNER, {name} won, YOUR ANGLE: UPLOADING, Keep ELO RATED open until your film uploads. (M-UPLOAD)"),
        dict(step="B8 · 4", who=ATH, title="Athlete confirms",
             inner=confirm,
             notes=["The shipped confirm step with the timekeeper's name. Code change (FE-7): the header reads the recorder's name from the timekeeper, not the opponent, and is not gated on anyone having confirmed. Both athletes start at WAITING ON YOU / WAITING because nobody is auto-confirmed. Confirm, dispute, the 24 h lock and the leave line are unchanged (D7). Rating is applied at record time, as today."],
             copy="TK-R5 RESULT RECORDED BY {NAME}; shipped Confirm result, YOUR RATING, WAITING, WAITING ON YOU, Dispute result, If you leave without disputing, it counts as confirming., Locks automatically in {n} h."),
        dict(step="B8 · 5", who=TKW, chips=[chip("D12", AMBER, AMBER_RULE)], title="Timekeeper's match page: film not uploaded",
             inner=tk_page,
             notes=["Shown while the timekeeper's angle has not landed. Upload now resumes the upload. Push TK-N8 nudges once, 2 h after the end (board B10).",
                    "If no usable timekeeper angle lands by the 24 h footage settle window, or the upload fails terminally, the match is flagged for admin review (match_timekeeper_footage_flags). Signal only: result, rating and dispute window stand, and athletes see nothing."],
             copy="TK-U1 Your film hasn't uploaded yet.; TK-U2 Upload now; shipped WINNER, {name} won"),
    ]
    return row_board(on_tag(), "Spec B.5 · FE-7 · BE-6", "Result, three roles",
                     "The timekeeper is the only one who records the result (D4). Both athletes then confirm or dispute exactly as today (D7); the recorder is no longer auto-confirmed.",
                     frames)


# ================================================================ B9
@board("P-TK-B9-Dropout.dc.html", "Timekeeper drop-out and cancel")
def b9():
    pre = screen(picker_head("9:58")
                 + notice(f"{TK} left. Pick a new timekeeper.")
                 + search_field() + section("Friends")
                 + person("Sam Whitfield", 1620, "online") + person("Priya Shah", 1455)
                 + section("Nearby") + person("Leo Tanaka", 1440, "live") + person("Kenji Mori", 1388, "live")
                 + invite_row(False), 12)
    pick_plate = (f'<div role="alert" style="background: {OM_CHIP}; border: 1px solid {OM_CHIP_B}; border-radius: 4px; padding: 14px; display: flex; flex-direction: column; gap: 12px">'
                  f'{row(deadline_chip("9:41"), 8)}'
                  f'<span style="font-family: {INTER}; font-size: 15px; line-height: 20px; color: {OM_INK}">{q(TK)} left. Pick a new timekeeper to finish this match.</span>'
                  f'{btn("Pick a new timekeeper", "primary", 52)}</div>')
    mid = live(you=True, strip=("TIMEKEEPER LEFT", "CLOCK PAUSED"), slab=("PAUSED", "02:46"), above=pick_plate, tally="REC 02:31")
    repl = live(hud_right=hud_tag("YOU RUN THE CLOCK"), you=False, strip=("PAUSED", "CAMERA STILL RECORDING"), slab=("PAUSED", "02:46"),
                above=(f'<div style="background: {OM_SLAB}; border: 1px solid {OM_STRONG}; border-radius: 4px; padding: 12px 14px">'
                       f'{body("Resume when you&#39;re ready.".replace("&#39;", chr(39)), 15, "#FFFFFF", 500)}</div>'),
                bottom=live_controls(True), tally=None)
    exit_dropout = (under(arena_bg(), 0.5)
                    + f'<div style="position: absolute; left: 16px; right: 16px; top: 59px">{toast("Match cancelled", "No timekeeper took over in time. The match won&#39;t count.".replace("&#39;", chr(39)))}</div>')
    exit_prestart = (under(arena_bg(), 0.5)
                     + f'<div style="position: absolute; left: 16px; right: 16px; top: 59px">{toast("Match cancelled", "No timekeeper joined in 10 minutes.")}</div>')
    offline_banner = (f'<div role="alert" style="background: {OM_SLAB}; border: 1px dashed {AMBER}; border-radius: 4px; padding: 12px 14px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 10px">'
                      f'{row(f"<span style=\"width: 8px; height: 8px; border-radius: 4px; background: {AMBER}\"></span>" + mono(TK.upper() + " IS OFFLINE", 11, AMBER, 700, 2.0), 8)}{deadline_chip("8:47")}</div>')
    offline = live(you=True, above=offline_banner, slab=("LIVE", "01:58"), bottom=runs_clock(TK.upper()), tally="REC 03:02")
    review = screen(mono("MATCH OVER", 10, INK2, 500, 2.52)
                    + f'<div style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px 0">{tile("JC", 96, 30)}'
                    f'<div role="status" style="box-sizing: border-box; width: 100%; padding: 14px; border: 1px dashed {AMBER}; border-radius: 3px; display: flex; flex-direction: row; gap: 10px; align-items: flex-start">'
                    f'<span style="width: 8px; height: 8px; margin-top: 4px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>'
                    f'{mono(TK.upper() + " DIDN" + chr(39) + "T RECORD THE RESULT · AN ADMIN WILL REVIEW IT", 11, AMBER, 700, 1.68, True, "white-space: normal")}</div></div>'
                    + facts_plate(), 20)
    frames = [
        dict(step="B9 · 1", who="BOTH ATHLETES", title="Before the start: back to the picker",
             inner=pre,
             notes=["The timekeeper tapped Leave (an immediate drop-out), or was offline for the full 10 minutes (frame 6 rule). The server clears timekeeper_id, both athletes' ready and the timekeeper's weight confirmations (weigh-ins and athlete checks stay) and sets a fresh 10-minute deadline.",
                    "The picker is the B2 picker (B1's rows and roster); Jordan Cruz is excluded from the list for this match."],
             copy="TK-D1 {name} left. Pick a new timekeeper.; TK-W1 CANCELS IN {m:ss}; TK-P1 to TK-P7, TK-P5b, TK-P10, TK-P11"),
        dict(step="B9 · 2", who=ATH, title="Mid-match: clock paused, pick a replacement",
             inner=mid,
             notes=["During the clock: an explicit Leave pauses the clock at that moment; an offline timekeeper becomes a drop-out only when their 10 minutes elapse, and the clock pauses then if it is still running (no backdated pause). The server clears timekeeper_id and sets a fresh 10-minute deadline. Cameras keep recording.",
                    "Pick a new timekeeper opens the picker as a sheet over this screen. Athletes are never handed the clock or the result (a losing athlete could force a drop-out to take control)."],
             copy="TK-D2 TIMEKEEPER LEFT · CLOCK PAUSED; TK-D3 {name} left. Pick a new timekeeper to finish this match.; TK-W1 CANCELS IN {m:ss}; TK-D4 Pick a new timekeeper; shipped PAUSED"),
        dict(step="B9 · 3", who=f"NEW TIMEKEEPER ({TK2})", title="Replacement accepted",
             inner=repl,
             notes=["L. Tanaka (approved by the other athlete if Q12 is accepted) accepted from the asked-person sheet (board B4) and lands on the paused live screen. Weight confirmations are not repeated mid-match. RESUME restarts the clock for all phones; the athletes' plate from frame 2 goes away when the replacement accepts."],
             copy="TK-D5 Resume when you're ready.; TK-L1; shipped RESUME, HOLD TO END, PAUSED · CAMERA STILL RECORDING"),
        dict(step="B9 · 4", who="BOTH ATHLETES", title="No replacement in 10 minutes: cancelled",
             inner=exit_dropout,
             notes=["Only while the clock has not ended: nobody took over within 10 minutes, so the sweep moves the match in_progress to cancelled (server only, timekeeper mode only). No rating change. After the end a match is never cancelled this way (frame 7). Uploaded video stays attached to the cancelled match, no highlight (Q6). Push TK-N6 to both athletes and the dropped timekeeper (board B10)."],
             copy="shipped toast title Match cancelled; TK-D6 No timekeeper took over in time. The match won't count."),
        dict(step="B9 · 5", who="BOTH ATHLETES", title="Pre-start: nobody joined in 10 minutes",
             inner=exit_prestart,
             notes=["The 10-minute rule before the start (D9): the server cancels the pending match and both athletes exit to the Arena. Push TK-N4."],
             copy="shipped toast title Match cancelled; TK-W2 No timekeeper joined in 10 minutes."),
        dict(step="B9 · 6", who=ATH, title="Timekeeper offline: clock keeps running",
             inner=offline,
             notes=["A 60 s heartbeat gap (match_timekeeper_presence, every 15 s) marks the timekeeper OFFLINE: the banner and the deadline chip appear and the 10-minute wait starts. Nothing else changes: the seat, the clock and any queued result stay valid, no pause. If they come back within 10 minutes the banner clears; if not, it becomes a drop-out (frame 2). Push TK-N5 is sent only at the drop-out."],
             copy="TK-D7 {NAME} IS OFFLINE; TK-W1 CANCELS IN {m:ss}; TK-L2"),
        dict(step="B9 · 7", who=ATH, title="After the end: no result, admin review",
             inner=review,
             notes=["After ended_at no Leave is offered: the timekeeper owes the result. A timekeeper who goes offline or stalls past the 10-minute result window does not cancel the match; it is flagged for admin review (match_timekeeper_review) and an admin records or voids it. This closes the 'void a loss by walking away' hole (review M8). Replaces the waiting view of board B8, frame 2."],
             copy="TK-D8 {NAME} DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT; shipped MATCH OVER, ENDED AT, CLOCK"),
    ]
    return row_board(on_tag(), "Spec B.6 · FE-8 · BE-8", "Timekeeper drop-out and cancel",
                     "Only an explicit Leave is an immediate drop-out; a heartbeat gap shows the timekeeper OFFLINE and starts the 10-minute wait without pausing. A drop-out sends the athletes back to the picker (before the start) or pauses the clock (during it); no replacement in 10 minutes cancels with no rating (D9). After the end there is no Leave and a stall goes to admin review.",
                     frames)


# ================================================================ B10
@board("P-TK-B10-Notifications-Edges.dc.html", "Pushes and edge cases")
def b10():
    def stack(items):
        return lock_screen("".join(annot(a) + push_card(t, b, w) for a, t, b, w in items))
    p_tk = stack([
        ("TK-N1 · timekeeper_requested · to the asked person", f"Timekeep {A['short']} vs {B['short']}?", f"{A['short']} asked you to start the match, run the clock and record the result.", "now"),
        ("TK-N6 · to the dropped timekeeper too", "Match cancelled", "No timekeeper took over in time. The match won't count.", "12m ago"),
    ])
    p_pre = stack([
        ("TK-N2 · timekeeper_accepted · background only", "Timekeeper joined", f"{TK} will run your match.", "now"),
        ("TK-N3 · timekeeper_declined · background only", "Pick another timekeeper", f"{TK} can't timekeep your match.", "3m ago"),
        ("TK-N4 · timekeeper_expired", "Match cancelled", "No timekeeper joined in time. Challenge again when you're ready.", "5m ago"),
        ("shipped · push/index.ts:444-445 · not sent to the timekeeper", "Match Started", "Your match has begun!", "8m ago"),
    ])
    p_mid = stack([
        ("TK-N5 · timekeeper dropped out", "Your timekeeper left", "Your match is paused. Pick a new timekeeper within 10 minutes.", "now"),
        ("TK-N6 · cancelled after a drop-out", "Match cancelled", "No timekeeper took over in time. The match won't count.", "2m ago"),
        ("TK-N7 · result recorded · background only", "Confirm your result", f"{TK} recorded {A['short']} vs {B['short']}. Confirm or dispute it.", "6m ago"),
    ])
    p_n8 = stack([("TK-N8 · to the timekeeper · 2 h after the end, once (D12)", "Upload your match film", f"{A['short']} vs {B['short']} needs your film. Open ELO RATED to finish the upload.", "now")])
    r_ok = tk_athlete(A, True, True, "confirmed") + tk_athlete(B, True, False, "ask")
    leave = under(tk_faceoff(r_ok, reason="CONFIRM BOTH WEIGHTS"), 0.4) + alert("Stop timekeeping?", "The match waits up to 10 minutes for a new timekeeper.", "Keep timekeeping", "Leave")
    approve = screen(picker_head("8:05", me="B") + approval_card()
                     + search_field() + section("Friends") + person("Sam Whitfield", 1620, "online", action=None, dim=True)
                     + person("Priya Shah", 1455, "", A["short"], action=None, dim=True), 12)
    left = (under(arena_bg(), 0.5)
            + f'<div style="position: absolute; left: 16px; right: 16px; top: 59px">{toast("Match cancelled", A["short"] + " left the match.")}</div>')
    frames = [
        dict(step="B10 · 1", who="TIMEKEEPER", title="Pushes to the timekeeper",
             inner=p_tk,
             notes=["TK-N1 is a social_notifications kind in category matches (not friends, which a user may mute). Pushes have no action buttons: a tap opens the in-app Timekeep this match? sheet on the non-tab-root route /match/[matchId]/timekeep (board B4)."],
             copy="TK-N1, TK-N6"),
        dict(step="B10 · 1b", who="TIMEKEEPER", chips=[chip("D12", AMBER, AMBER_RULE)], title="Upload nudge to the timekeeper",
             inner=p_n8,
             notes=["Sent once, only if the timekeeper's upload has not landed 2 h after the end. A tap opens their match page with TK-U1 and Upload now (board B8, frame 5).",
                    "The missing-footage flag (match_timekeeper_footage_flags) is admin only: no athlete UI, no effect on the result, rating or disputes."],
             copy="TK-N8 Upload your match film / {A} vs {B} needs your film. Open ELO RATED to finish the upload."),
        dict(step="B10 · 2", who="BOTH ATHLETES", title="Pushes to the athletes, before and at the start",
             inner=p_pre,
             notes=["TK-N2 and TK-N3 fire only when the app is in the background; in the app the picker already shows the change (board B3). TK-N3 also covers a request that lapsed after 2 minutes."],
             copy="TK-N2, TK-N3, TK-N4; shipped Match Started / Your match has begun!"),
        dict(step="B10 · 3", who="BOTH ATHLETES", title="Pushes to the athletes, during and after",
             inner=p_mid,
             notes=["Deep links target non-tab-root routes (tab-root targets are dropped during a match)."],
             copy="TK-N5, TK-N6, TK-N7"),
        dict(step="B10 · 4", who=TKW, title="Timekeeper taps Leave",
             inner=leave,
             notes=["Offered before the end only. Before the start, Leave only removes the timekeeper (leave_match_as_timekeeper) and the drop-out rule runs (board B9, frame 1); during the clock it pauses the clock and runs the mid-match drop-out rule (B9, frame 2). After the clock ends there is no Leave (B9, frame 7)."],
             copy="TK-K14 Stop timekeeping? / The match waits up to 10 minutes for a new timekeeper. / Keep timekeeping / Leave"),
        dict(step="B10 · 5", who=TKW, title="An athlete left before the start",
             inner=left,
             notes=["Before the start an athlete's Leave cancels the match for everyone, as today; the timekeeper exits with this toast. After the start athletes have no Leave in either mode (unchanged)."],
             copy="shipped toast title Match cancelled; TK-E1 {athlete} left the match."),
        dict(step="B10 · 6", who=f"OTHER ATHLETE ({B['short']})", chips=[chip("Pending owner (Q12)", NEG, NEG_RULE)], title="Variant: the opponent approves the pick",
             inner=approve,
             notes=["Same card as board B2, frame 5 (candidate row, Not this one then Approve), drawn on D. Okafor's phone. Recommended, pending the owner (Q12): a pick first goes to the other athlete as a one-tap approval card and is sent to the person only once approved, all inside the same 10-minute window. Not this one returns the picker to both athletes. The code join runs through the same approval rule."],
             copy="TK-P25 {athlete} picked {name}. OK with you?; TK-P26 Approve; TK-P27 Not this one; TK-W1"),
    ]
    edges = [
        "Timekeeper busy: the new _timekeeper_busy helper (timekeeper-mode matches only; _athlete_busy is not changed) keeps anyone seated as timekeeper of an active match out of the candidates and refuses requests and the code join (timekeeper_busy); the picker row shows TK-P8 Timekeeping another match or TK-P9 Running their own match (board B3). One person timekeeps one match at a time.",
        "Asked person offline: the push is the only channel; the request lapses after 2 minutes (TK-P22).",
        "Athlete app killed mid-match: unchanged; the timekeeper runs the match and records the result; the athlete confirms later or the 24 h cron confirms.",
        "Flag flipped mid-match: no effect; the match keeps its requires_timekeeper snapshot. The wizard routes on requires_timekeeper from get_match_details, never on the live flag.",
        "Invite bookings (_start_invite_booking) snapshot the same way; the picker appears after the booking starts, as after an Arena accept. Practice matches are client-only and never timekeeper mode.",
        "Timekeeper records video: required (D12), through the existing record-only media rights; athletes stay optional (D8). A missing timekeeper angle is an admin-only flag (match_timekeeper_footage_flags): athletes see nothing.",
    ]
    return row_board(on_tag(), "Spec B.7, B.8 · BE-9", "Pushes and edge cases",
                     "Every push per role (TK-N1 to TK-N8 plus the shipped Match Started), the timekeeper's Leave alert (before the end only), the exit when an athlete leaves, and the opponent-approval variant pending the owner (Q12).",
                     frames, "Edge cases (spec B.8)", edges)


# ================================================================ B11
@board("P-TK-B11-Phase2-Invite.dc.html", "PHASE 2: off-platform timekeeper")
def b11():
    p2 = big_tag("PHASE 2 · NOT IN THE FIRST BUILD")
    P2 = chip("PHASE 2", AMBER, AMBER)
    picker = screen(picker_head("8:20")
                    + search_field() + section("Friends") + person("Jordan Cruz", 1301, "live", B["short"]) + person("Sam Whitfield", 1620, "online")
                    + section("Nearby") + f'<p style="margin: 0; padding: 10px 0; border-top: 1px dashed {HL}; border-bottom: 1px dashed {HL}">{body("Nobody else on the mat right now.", 13, INK2)}</p>'
                    + invite_row(True), 12)
    share = (under(picker, 0.35)
             + f'<div role="dialog" aria-label="Share" style="position: absolute; left: 0; right: 0; bottom: 0; background: {PANEL}; border-top: 1px solid {HLS}; border-radius: 12px 12px 0 0; padding: 10px 16px 34px; display: flex; flex-direction: column; gap: 14px">'
             f'<div aria-hidden="true" style="align-self: center; width: 36px; height: 4px; border-radius: 2px; background: {HLS}"></div>'
             f'{annot("iOS share sheet (system UI, illustrative)")}'
             f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 8px; padding: 12px; display: flex; flex-direction: row; gap: 10px; align-items: flex-start">'
             f'<div style="width: 40px; height: 40px; border-radius: 8px; background: {VOID}; border: 1px solid {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {BEBAS}; font-size: 15px; color: {INK}">ER</div>'
             f'{body("Can you timekeep M. Reyes vs D. Okafor? Join ELO RATED to run the match: https://elorated.com/c/7QK2M9", 13, INK)}</div>'
             f'<div style="display: flex; flex-direction: row; gap: 16px; justify-content: flex-start">'
             + "".join(f'<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px"><div style="width: 56px; height: 56px; border-radius: 12px; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">{ic(i, 22, INK)}</div>{body(t, 11, INK2)}</div>'
                       for i, t in [("msg", "Messages"), ("mail", "Mail"), ("copy", "Copy")])
             + '</div></div>')
    wait_join = screen(picker_head("7:45")
                       + pending_card(None, "Waiting for them to join.")
                       + annot("Unclaimed invite: the deadline is not extended. The invite link expires with the match deadline.")
                       + search_field() + section("Friends") + person("Jordan Cruz", 1301, "live", B["short"], action=None, dim=True)
                       + person("Sam Whitfield", 1620, "online", action=None, dim=True), 12)
    claimed = screen(picker_head("16:30")
                     + annot("Claimed: deadline extended once by 10:00 (Q8, pending owner). Shown on both athletes' chips.")
                     + pending_card("Asked P. Lam", "Waiting for them to accept.")
                     + annot("The claim turns the invite into a normal in-app request to the new user; the 2-minute request lapse does not apply to invite requests."), 14)
    landing = screen(f'<div style="display: flex; align-items: center; justify-content: space-between">'
                     f'<span style="font-family: {BEBAS}; font-size: 22px; color: {INK}">ELO RATED</span>{annot("elorated.com invite landing (016), web")}</div>'
                     f'<h1 style="margin: 0; font-family: {BEBAS}; font-weight: 400; font-size: 52px; line-height: 50px; color: {INK}">M. Reyes asked you to timekeep</h1>'
                     + fight_chip(you=False, sub="none")
                     + body("Create your account to start the match, run the clock and record the result. Your rating isn't affected.", 15, INK2)
                     + f'<span role="timer" style="align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 28px; box-sizing: border-box; padding: 0 9px; border: 1px solid {AMBER_RULE}; border-radius: 2px">{ic("timer", 13, AMBER)}{body("Link expires in 7:10", 13, AMBER, 500)}</span>'
                     + spacer()
                     + btn("Open in app", "primary", 52)
                     + row("".join(f'<div style="flex: 1; height: 44px; border-radius: 8px; border: 1px solid {HLS}; background: #000000; display: flex; align-items: center; justify-content: center">{annot(t)}</div>' for t in ("App Store badge", "Google Play badge")), 10)
                     + row(btn("Sign up on web", "secondary", 44, flex=True) + btn("Log in", "secondary", 44, flex=True, extra=f"background: transparent; border-color: transparent; color: {INK2}"), 10), 14, pad="47px 16px 34px 16px")
    bst = f"font-family: {DM}; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1.12px"
    ask_sheet = (f'<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.55); padding: 220px 16px 80px; box-sizing: border-box">'
                 f'<div role="dialog" aria-modal="true" aria-label="Timekeep this match?" style="box-sizing: border-box; background: {PLATE}; border: 1px solid {HLS}; border-radius: 8px; padding: 24px 16px; display: flex; flex-direction: column; gap: 24px">'
                 f'{row(heading("Timekeep this match?", 20, INK, False, 0, tag="h1") + mono("ANSWER IN 1:42", 13, INK, 700, 0.5, False), 10, "center", "space-between")}'
                 f'{fight_chip(you=False, sub="elo")}'
                 f'<p style="margin: 0">{body("You start the match, run the clock and record the result. Your rating isn" + chr(39) + "t affected.", 14, INK2)}</p>'
                 f'{row(ic("video", 16, INK2, style="margin-top: 2px") + body("Timekeepers record the match on video. ELO RATED analyses the film with AI.", 13, INK2), 8, "flex-start")}'
                 f'<div style="display: flex; gap: 12px"><a href="#" style="flex: 1 1 0; height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 3px; border: 1px solid {HLS}; color: {INK}; {bst}">Decline</a>'
                 f'<a href="#" style="flex: 2 1 0; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 3px; background: {RED}; color: {VOID}; {bst}">Accept</a></div></div></div>')
    frames = [
        dict(step="B11 · 1", who="ATHLETE", chips=[P2], title="Picker: invite row enabled",
             inner=picker,
             notes=["The row reserved (disabled) in phase 1 turns on. create_timekeeper_invite(p_match_id) writes a 016 invites row with kind = 'timekeeper' and match_id, link_expires_at = the match deadline, same code throttles."],
             copy="TK-P10 Invite someone not on ELO RATED; TK-P11 PHASE 2 (board annotation); TK-P13"),
        dict(step="B11 · 2", who="ATHLETE", chips=[P2], title="Share the invite",
             inner=share,
             notes=["The system share sheet with the prefilled message. The link path is illustrative (the shipped 016 landing lives at /c/[token])."],
             copy="TK-X1 Can you timekeep {A} vs {B}? Join ELO RATED to run the match: {link}"),
        dict(step="B11 · 3", who="BOTH ATHLETES", chips=[P2], title="Waiting for them to join",
             inner=wait_join,
             notes=["The match's request row has channel = 'invite' and points at the invite, so the pending card works as for an in-app request. Ask someone else withdraws the invite. Other rows stay visible but cannot be asked while a request is open."],
             copy="TK-X2 Waiting for them to join.; TK-P19 Ask someone else; TK-W1"),
        dict(step="B11 · 4", who="BOTH ATHLETES", chips=[P2], title="They claimed: deadline extended once",
             inner=claimed,
             notes=["Recommended (Q8, pending owner): a claimed timekeeper invite extends the deadline once by 10 minutes, because sign-up takes 3 to 6 minutes. An unclaimed invite does not extend it."],
             copy="TK-P17 Asked {name}; TK-P18 Waiting for them to accept.; TK-W1"),
        dict(step="B11 · 5", who="INVITEE (WEB)", chips=[P2], title="Invitee landing",
             inner=landing,
             notes=["Public page: names and the link deadline only; no weights and no ratings (review M4; flag to the owner beside Q11).", "The 016 invite landing extended for kind = 'timekeeper'. The actions are the shipped landing actions (Open in app, store badges, Sign up on web, Log in). The invitee needs an account, the age and terms gates and the claim (claim_timekeeper_invite); no weight, rating or go-live."],
             copy="TK-X5 Link expires in {m:ss}; TK-X3 {athlete} asked you to timekeep; TK-X4 Create your account to start the match, run the clock and record the result. Your rating isn't affected.; shipped 016 Open in app, Sign up on web, Log in"),
        dict(step="B11 · 6", who="INVITEE (APP, AFTER CLAIM)", chips=[P2], title="Claimed: the same accept sheet",
             inner=ask_sheet,
             notes=["A copy of board B4, frame 2 (Decline left, Accept right, ELO only, no weights). After the claim the new user gets the same sheet as an in-app pick; Accept ends in the shared _set_match_timekeeper core. Owner to decide whether the claim creates a friendship and whether invite caps apply (Q11)."],
             copy="TK-T1 Timekeep this match?; TK-T2; TK-T7 Timekeepers record the match on video. ELO RATED analyses the film with AI.; TK-T3 Accept; TK-T4 Decline; TK-T5 ANSWER IN {m:ss}"),
    ]
    return row_board(p2 + on_tag(), "Spec P · BE-P2 · FE-P2", "PHASE 2: off-platform timekeeper",
                     "Not in the first build. How an athlete would invite someone who is not on ELO RATED to timekeep, reusing the 016 invites system so phase 1 is not painted into a corner (D3, owner update 2026-10-15).",
                     frames)


# ================================================================ C1
@board("P-TK-C1-Merged-Ready-FlagOff.dc.html", "OPTIONAL: merged ready for flag OFF")
def c1():
    weigh = screen(f'<div style="display: flex; flex-direction: column; gap: 20px">{topbar("FACE-OFF · WEIGH IN")}{fight_card()}</div>'
                   + f'<div style="display: flex; flex-direction: column; gap: 20px">{gap_line()}{stakes()}'
                   + body("The heavier athlete's rating is adjusted for the weight gap.", 12, INK3)
                   + row(plate("CONFIRM WEIGHT", False) + plate("D. OKAFOR WEIGHED IN", True, "right"), 12)
                   + btn("Confirm 172.5 lbs", "primary", 64) + '</div>', 16)

    def ready(waiting):
        plates = row(plate("YOU · READY" if waiting else "YOU · NOT READY", waiting) + plate("D. OKAFOR · NOT READY", False, "right"), 12)
        if waiting:
            foot = btn("Weight looks right, I'm ready", "primary", 72, disabled=True) + hold_line("WAITING FOR D. OKAFOR...")
        else:
            foot = (f'<div style="display: flex; justify-content: center">{mono("D. OKAFOR WEIGHED IN AT 171.4 LBS", 11, INK, 700, 1.68)}</div>'
                    + f'<div style="display: flex; justify-content: center">{body("Match starts when you both tap ready", 13, INK2)}</div>'
                    + btn("Weight looks right, I'm ready", "primary", 72) + btn("Doesn't look right", "secondary", 56))
        return screen(f'<div style="display: flex; flex-direction: column; gap: 16px">{topbar("FACE-OFF · READY")}{fight_chip(True)}</div>'
                      + camera_card() + record_panel("D. OKAFOR RECORDING", True) + plates
                      + f'<div style="display: flex; flex-direction: column; gap: 10px">{foot}</div>', 16)
    tag = big_tag("OPTIONAL · NOT BEFORE ALPHA")
    frames = [
        dict(step="C1 · 1", who=ATH, title="Weigh-in: own weight only",
             inner=weigh,
             notes=["The shipped weigh-in, minus the opponent weight check panel: the opponent plate just reports their weigh-in. The check moves to the ready step."],
             copy="shipped FACE-OFF · WEIGH IN, ELO {n}, {w} LBS, {d} LBS APART · SAME DIVISION, CONFIRM WEIGHT, WEIGHED IN, Confirm {w} lbs"),
        dict(step="C1 · 2", who=ATH, title="Ready: opponent weight line and merged button",
             inner=ready(False),
             notes=["One tap confirms my check of D. Okafor's weight and marks me ready. Doesn't look right opens the shipped flag flow. In flag-OFF mode ready is still a broadcast, so 'ready implies checked' stays client-enforced until server-side ready (BE-3) exists."],
             copy="TK-F4 Weight looks right, I'm ready (reused); shipped {OPP} WEIGHED IN AT {w} LBS, Doesn't look right, Match starts when you both tap ready, YOU · NOT READY, {OPP} · NOT READY"),
        dict(step="C1 · 3", who=ATH, title="Waiting for the opponent",
             inner=ready(True),
             notes=["After the tap: the shipped waiting line. The dual auto-start, the result claim and the self-recorded result stay as they are."],
             copy="shipped YOU · READY, WAITING FOR {OPP}..."),
    ]
    notes = [
        "Rationale: one screen fewer at the moment athletes most want to start, and one face-off design for both modes.",
        "Risk to the alpha: high relative to the gain. It changes the shipped face-off order that the match-loop harness (tools/match-loop) drives, and it touches the race-sensitive dual auto-start in use-faceoff.ts.",
        "Recommendation (spec C, Q2): do not ship before the alpha. Reconsider after the alpha once server-side ready (BE-3) exists, and only if alpha feedback says the face-off is too long. No other flag-OFF change is recommended.",
    ]
    return row_board(tag + chip("OPTIONAL · FLAG OFF", INK2, HLS), "Spec C · D11", "OPTIONAL: merged ready for flag OFF",
                     "Separate from timekeeper mode. The same weight-and-ready merge as board B5, applied to today's two-athlete flow. Drawn so the owner can compare; not recommended before the alpha.",
                     frames, "Why it is optional", notes)


# ================================================================ output
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


CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def measure(html):
    s = html.replace('<script src="./support.js"></script>', "")
    s = re.sub(r'(<div style="width: \d+px; )height: \d+px;', r"\1height: auto;", s, count=1)
    s = s.replace("</body>", '<script>window.addEventListener("load",()=>setTimeout(()=>{document.body.setAttribute("data-h",document.querySelector("x-dc > div").scrollHeight)},300))</script></body>')
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(s)
    out = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--virtual-time-budget=6000", "--dump-dom", "file://" + f.name],
                         capture_output=True, text=True, timeout=120).stdout
    os.unlink(f.name)
    m = re.search(r'data-h="(\d+)"', out)
    return int(m.group(1)) if m else None


def main():
    do_measure = "--measure" in sys.argv
    bj = os.path.join(HERE, "boards_b2.json")
    prev = {b["id"]: b["h"] for b in json.load(open(bj))} if os.path.exists(bj) else {}
    written = []
    for file, title, fn in BOARDS:
        bid = file.replace(".dc.html", "")
        w, inner = fn()
        h = prev.get(bid, 1600)
        if do_measure:
            mh = measure(page(title, w, h, inner))
            assert mh, f"measure failed for {file}"
            h = mh
        html = page(title, w, h, inner)
        assert not any(c in html for c in BANNED), f"dash in {file}"
        assert "!" not in re.sub(r"<!doctype html>|Your match has begun!", "", html), f"exclamation in {file}"
        open(os.path.join(OUT, file), "w").write(html)
        written.append({"id": bid, "file": file, "title": title, "w": w, "h": h})
    json.dump(written, open(bj, "w"), indent=2, ensure_ascii=False)
    print("\n".join(f'{b["file"]} {b["w"]}x{b["h"]}' for b in written))


if __name__ == "__main__":
    main()
