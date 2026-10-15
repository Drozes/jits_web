"""Designer B1 boards for "Proposed (Oct 15 Timekeeper)" (PROPOSED, FOR OWNER REVIEW, 2026-10-15).

Boards: P-TK-00-Map, P-TK-B-Rules, P-TK-B1-Arena-Copy, P-TK-B2-Picker, P-TK-B3-Picker-States,
P-TK-B4-Timekeeper-Ask, P-TK-B5-Athlete-Faceoff.

Static markup only: this script writes .dc.html files; nothing in the boards is script-built.
Format copied from ../2026-10-06-matches-tab/generate.py (the exact support.js line, root size equal to
the board's w/h and $preview, 390 px dark boards of stacked phone frames with captions, 1440 px map).
Usage:
  python3 gen_b1.py               # writes every board, measures its natural height with headless
                                  # Chrome, rewrites it at that height, writes boards_b1.json
  python3 gen_b1.py --no-measure  # single pass at a fixed 6000 px (no Chrome)
Sources of truth: SPEC.md and COPY-DECK.md in this folder (copy wins), plus the coordinator's spec
review changes of 2026-10-15 (end_match_clock, request/accept for code/QR, version gate, server
auto-end and stall, OFFLINE wait, no Leave after the clock ends, re-weigh voids the timekeeper
confirmation, Q12). Tokens: apps/mobile/lib/tokens.ts (dark). Shipped chrome: live canvas boards
15-Challenge-Sheet, 14-Arena-Waiting, 21-Faceoff-Weight, 21b, 21c, 22-Ready-Check, 55-Friends
(canvas version 1792079812-15a6).
Sample data (BOARDS.md): M. Reyes (challenger, 1512, 172.5 LBS), D. Okafor (opponent, 1487,
171.4 LBS), J. Cruz (timekeeper).
"""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "project")
os.makedirs(OUT, exist_ok=True)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BAD_DASHES = (chr(0x2014), chr(0x2013), chr(0x2015))

# ---- tokens (dark), apps/mobile/lib/tokens.ts ----
VOID, PANEL, PLATE, BRIGHT = "#0D0F14", "#13151B", "#1E222B", "#262A34"
INK, INK2, INK3 = "#E8EDF2", "#9CA3AF", "#8D929D"
RED, NEG, AMBER, GREEN = "#E63946", "#EC6A74", "#F59E0B", "#22C55E"
HL, HLF, HLS = "rgba(107,114,128,0.45)", "rgba(107,114,128,0.20)", "rgba(107,114,128,0.62)"
AMBER_RULE, RED_RULE, GREEN_RULE = "rgba(245,158,11,0.7)", "rgba(236,106,116,0.7)", "rgba(34,197,94,0.55)"
PH = "rgba(232,237,242,0.35)"
MONO, DM, INTER, BEBAS = "'JetBrains Mono', monospace", "'DM Sans', sans-serif", "'Inter', sans-serif", "'Bebas Neue', sans-serif"
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'
MINUS = chr(0x2212)

# ---- sample data ----
A, B, TK = "M. Reyes", "D. Okafor", "J. Cruz"
A_ELO, B_ELO, A_W, B_W = 1512, 1487, "172.5", "171.4"

# ---- board ids (Designer A ids per the coordinator, 2026-10-15) ----
BA = [("P-TK-A1-Challenge-To-Faceoff", "A1", "Challenge accepted to face-off"),
      ("P-TK-A2-Faceoff-Weight-Ready", "A2", "Weigh-in, weight check, ready, auto-start"),
      ("P-TK-A3-Live", "A3", "Countdown and live"),
      ("P-TK-A4-Result-Confirm", "A4", "Result, confirm, dispute, verdict"),
      ("P-TK-A5-State-Machine", "A5", "Current state machine, DB vs broadcast")]
BB = [("P-TK-B-Rules", "Rules", "Who can do what, flag OFF vs timekeeper mode"),
      ("P-TK-B1-Arena-Copy", "B1", "Arena with the flag on (TK-AR1, TK-AR2)"),
      ("P-TK-B2-Picker", "B2", "Pick a timekeeper: default, search, pending, other athlete"),
      ("P-TK-B3-Picker-States", "B3", "Picker empty, busy, declined, lapsed, accepted, under 2:00"),
      ("P-TK-B4-Timekeeper-Ask", "B4", "The asked person: push, sheet, closed, entering"),
      ("P-TK-B5-Athlete-Faceoff", "B5", "Athlete face-off with the merged ready"),
      ("P-TK-B6-Timekeeper-Faceoff", "B6", "Timekeeper face-off and Start"),
      ("P-TK-B7-Live", "B7", "Live, three roles"),
      ("P-TK-B8-Result", "B8", "Result, three roles"),
      ("P-TK-B9-Dropout", "B9", "Timekeeper drop-out and cancel"),
      ("P-TK-B10-Notifications-Edges", "B10", "Pushes and edge cases"),
      ("P-TK-B11-Phase2-Invite", "B11", "PHASE 2: off-platform timekeeper"),
      ("P-TK-C1-Merged-Ready-FlagOff", "C1", "OPTIONAL: merged ready for flag OFF")]


def href(bid):
    return f"{bid}.dc.html"


# ---- lucide icons (24 grid, stroke 2) ----
I = {
    "chev_l": '<path d="m15 18-6-6 6-6"></path>',
    "chev_r": '<path d="m9 18 6-6-6-6"></path>',
    "search": '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
    "userplus": '<path d="M2 21a8 8 0 0 1 13.292-6"></path><circle cx="10" cy="8" r="5"></circle><path d="M19 16v6"></path><path d="M22 19h-6"></path>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    "timer": '<line x1="10" x2="14" y1="2" y2="2"></line><line x1="12" x2="15" y1="14" y2="11"></line><circle cx="12" cy="14" r="8"></circle>',
    "x": '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    "wifioff": '<path d="M12 20h.01"></path><path d="M8.5 16.429a5 5 0 0 1 7 0"></path><path d="M5 12.859a10 10 0 0 1 5.17-2.69"></path><path d="M19 12.859a10 10 0 0 0-2.007-1.523"></path><path d="M2 8.82a15 15 0 0 1 4.177-2.643"></path><path d="M22 8.82a15 15 0 0 0-11.288-3.764"></path><path d="m2 2 20 20"></path>',
}


def ic(name, size=16, color="currentColor", sw=2, style=""):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: block; flex-shrink: 0{"; " + style if style else ""}">{I[name]}</svg>')


def q(t):
    """Text content: & and < escaped, straight apostrophes as entities (house style of the boards)."""
    return t.replace("&", "&amp;").replace("<", "&lt;").replace("'", "&#39;")


# ---- text atoms (as the Oct 6 generator) ----
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


def row(inner, gap=8, align="center", justify="flex-start", extra=""):
    return f'<div style="display: flex; flex-direction: row; align-items: {align}; justify-content: {justify}; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


def col(inner, gap=8, extra=""):
    return f'<div style="display: flex; flex-direction: column; gap: {gap}px{"; " + extra if extra else ""}">{inner}</div>'


def caption(t):
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 0 16px">'
            f'{mono(t, 10, INK3, 700, 2.52, True, "white-space: normal; max-width: 300px")}<div style="flex: 1; min-width: 24px; height: 1px; background: {HLF}"></div></div>')


def note(t):
    return f'<p style="margin: 0; padding: 0 16px">{body(t, 12, INK3)}</p>'


def sheet_title(t, sub):
    return (f'<div style="display: flex; flex-direction: column; gap: 6px; padding: 0 16px">'
            f'{heading(t, 18, INK, tag="h1")}<p style="margin: 0">{body(sub, 12, INK2)}</p></div>')


def sheet(inner):
    return f'<div style="padding: 47px 0 40px 0; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0">{inner}</div>'


def corner_tag(t, tone="amber"):
    c, b = {"amber": (AMBER, AMBER_RULE), "ink": (INK, HLS), "red": (NEG, RED_RULE)}[tone]
    return (f'<span style="display: inline-flex; align-items: center; height: 22px; box-sizing: border-box; padding: 0 8px; border-radius: 2px; border: 1px solid {b}; '
            f'background: {VOID}; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; text-transform: uppercase; color: {c}; white-space: nowrap">{q(t)}</span>')


def board_head(tags):
    """Corner tag(s) at the top right of a 390 board (BOARDS.md: every board carries one)."""
    return f'<div style="position: absolute; top: 14px; right: 16px; display: flex; gap: 6px; z-index: 2">{"".join(tags)}</div>'


TAG_B = corner_tag("TIMEKEEPER MODE (FLAG ON)", "amber")
TAG_P2 = corner_tag("PHASE 2", "ink")
TAG_PENDING = corner_tag("PENDING OWNER", "red")
TAG_REVIEW = corner_tag("REVIEW ROUND 1 APPLIED", "ink")


def phase2_chip():
    return (f'<span style="display: inline-flex; align-items: center; gap: 5px; height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; '
            f'border: 1px solid {HLS}; background: {VOID}; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; letter-spacing: 1.68px; '
            f'text-transform: uppercase; color: {INK2}; white-space: nowrap">{ic("lock", 11, INK2)}PHASE 2</span>')


def frame(inner):
    """A full 390 x 844 screen inside the phone box."""
    return (f'<div style="width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; position: relative; background: {VOID}; '
            f'display: flex; flex-direction: column">{inner}</div>')


def phone(inner, pad="55px 16px 34px 16px", gap=16):
    return frame(f'<div style="padding: {pad}; display: flex; flex-direction: column; gap: {gap}px; flex: 1 1 auto; min-height: 0">{inner}</div>')


def toast(title, desc=None, tone=RED):
    d = f'<p style="margin: 2px 0 0">{body(desc, 12, INK2)}</p>' if desc else ""
    return (f'<div role="status" style="display: flex; flex-direction: column; background: {PLATE}; border: 1px solid {HLS}; border-left: 3px solid {tone}; '
            f'border-radius: 4px; padding: 12px 14px; flex-shrink: 0">{heading(title, 13, INK)}{d}</div>')


# ---- buttons (shipped face-off sizes) ----
def btn_red(t, h=64, href_="#", aria=None):
    a = f' aria-label="{q(aria)}"' if aria else ""
    return (f'<a href="{href_}"{a} style="height: {h}px; box-sizing: border-box; padding: 0 16px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; '
            f'background: {RED}; border-radius: 3px; font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase; color: {VOID}; text-align: center">{q(t)}</a>')


def btn_sec(t, h=56, href_="#", aria=None, extra=""):
    a = f' aria-label="{q(aria)}"' if aria else ""
    return (f'<a href="{href_}"{a} style="height: {h}px; box-sizing: border-box; padding: 0 16px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; '
            f'background: {PLATE}; border: 1px solid {HLS}; border-radius: 3px; font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}; text-align: center{"; " + extra if extra else ""}">{q(t)}</a>')


def btn_outline_small(t, aria=None, disabled=False):
    a = f' aria-label="{q(aria)}"' if aria else ""
    op = " opacity: 0.4;" if disabled else ""
    dis = ' disabled=""' if disabled else ""
    return (f'<button type="button"{a}{dis} style="margin: 0; background: none; cursor: pointer; font: inherit; color: inherit; height: 32px; box-sizing: border-box; display: flex; align-items: center; '
            f'border-radius: 2px; border: 1px solid {HLS}; padding: 0 12px; flex-shrink: 0;{op}">'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 11px; line-height: 14px; text-transform: uppercase; letter-spacing: 1.12px; color: {INK}">{q(t)}</span></button>')


# ---- shipped face-off chrome ----
def top_bar(label):
    return (f'<div style="height: 44px; display: flex; flex-direction: row; align-items: center">'
            f'<div style="flex: 1; min-width: 88px; display: flex; align-items: center">'
            f'<a href="#" aria-label="Cancel match" style="height: 44px; display: flex; flex-direction: row; align-items: center; gap: 6px; color: {INK}">{ic("chev_l", 18, INK)}'
            f'<span style="font-family: {DM}; font-weight: 700; font-size: 13px; letter-spacing: 1.12px; text-transform: uppercase; color: {INK}; white-space: nowrap">Leave</span></a></div>'
            f'<div style="flex-shrink: 1; min-width: 0; display: flex; justify-content: center">{mono(label, 10, INK3, 700, 2.52)}</div>'
            f'<div style="flex: 1; min-width: 88px"></div></div>')


def fight_chip(me=A, you_dot=True, elo_only=False):
    """FaceoffChip (shipped ready-phase plate). `me` goes left with the red you-mark."""
    other = B if me == A else A
    data = {A: (A_ELO, A_W), B: (B_ELO, B_W)}

    def sub(n):
        e, w = data[n]
        return f"ELO {e}" if elo_only else f"{e} · {w} LBS"
    dot = f'<span style="width: 4px; height: 4px; background: {RED}; flex-shrink: 0"></span>' if you_dot else ""
    pl = "11px" if you_dot else "0"
    return (f'<div style="height: 64px; box-sizing: border-box; display: flex; flex-direction: row; background: {PLATE}; border: 1px solid {HLS}; border-radius: 3px; flex-shrink: 0">'
            f'<div style="flex: 1; min-width: 0; padding-left: 12px; display: flex; flex-direction: column; justify-content: center; gap: 5px">'
            f'{row(dot + heading(me, 16, INK, True, 0.56, "white-space: nowrap"), 7)}'
            f'<span style="padding-left: {pl}">{mono(sub(me), 11, INK3, 400, 0, False)}</span></div>'
            f'<div style="width: 44px; display: flex; align-items: center; justify-content: center"><span style="font-family: {BEBAS}; font-size: 22px; line-height: 26px; color: {NEG}">VS</span></div>'
            f'<div style="flex: 1; min-width: 0; padding-right: 12px; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 5px">'
            f'{heading(other, 16, INK, True, 0.56, "white-space: nowrap")}{mono(sub(other), 11, INK3, 400, 0, False)}</div></div>')


def fight_card():
    """FightCard (weigh-in phase), viewer M. Reyes on the left."""
    def side(ini, n, elo, w, left):
        bb = f"; border-bottom: 3px solid {RED}" if left else ""
        al = "flex-start" if left else "flex-end"
        return (f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: {al}; gap: 10px">'
                f'<div aria-hidden="true" style="width: 100%; height: 150px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {PLATE}; border: 1px solid {HLS}; border-radius: 2px{bb}">'
                f'<span style="font-family: {BEBAS}; font-size: 64px; letter-spacing: 1.12px; color: {INK}">{ini}</span></div>'
                f'{heading(n, 16, INK, True, 0.56, "white-space: nowrap")}{mono(f"ELO {elo}", 12, INK2, 500, 0, False)}'
                f'<span style="font-family: {BEBAS}; font-size: 36px; line-height: 44px; color: {INK}">{w} LBS</span></div>')
    return (f'<div style="display: flex; flex-direction: row; align-items: flex-start">{side("MR", A, A_ELO, A_W, True)}'
            f'<div style="width: 40px; height: 150px; display: flex; align-items: center; justify-content: center"><span style="font-family: {BEBAS}; font-size: 30px; line-height: 36px; color: {NEG}">VS</span></div>'
            f'{side("DO", B, B_ELO, B_W, False)}</div>')


# One stakes set for the whole page (board review m4): M. Reyes 1512 vs D. Okafor 1487.
STAKES_A = ("▲ +14", f"▼ {MINUS}2", f"▼ {MINUS}18")    # M. Reyes (same set as A1, A2, A4, B8, C1)
STAKES_B = ("▲ +18", "▲ +1", f"▼ {MINUS}13")           # D. Okafor (same set as A1)


def stakes(win=STAKES_A[0], draw=STAKES_A[1], loss=STAKES_A[2], h=56, bg=PLATE):
    cells = [("WIN", win, GREEN, ""), ("DRAW", draw, AMBER, f"border-left: 1px solid {HL}; "), ("LOSS", loss, NEG, f"border-left: 1px solid {HL}; ")]
    out = "".join(f'<div style="flex: 1; {bl}display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px">'
                  f'{mono(l, 10, INK3, 500, 2.52)}{mono(v, 16, c, 700, 0, False)}</div>' for l, v, c, bl in cells)
    return f'<div style="height: {h}px; box-sizing: border-box; display: flex; flex-direction: row; background: {bg}; border: 1px solid {HL}; border-radius: 3px; flex-shrink: 0">{out}</div>'


def plate(t, state, right=False):
    """StatusPlate: ok (check, hairline-strong) or wait (attention dashed with dot)."""
    jc = "flex-end" if right else "flex-start"
    if state == "ok":
        return (f'<div style="flex: 1; min-width: 0; height: 44px; box-sizing: border-box; padding: 0 12px; display: flex; align-items: center; justify-content: {jc}; gap: 8px; border: 1px solid {HLS}; border-radius: 3px">'
                f'{mono("✓", 12, INK, 700, 0, False)}{mono(t, 10, INK, 700, 1.68, True, "overflow: hidden; text-overflow: ellipsis")}</div>')
    return (f'<div style="flex: 1; min-width: 0; height: 44px; box-sizing: border-box; padding: 0 12px; display: flex; align-items: center; justify-content: {jc}; gap: 8px; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>{mono(t, 10, AMBER, 700, 1.68, True, "overflow: hidden; text-overflow: ellipsis")}</div>')


def plates(l, r):
    return f'<div style="display: flex; flex-direction: row; gap: 12px">{plate(*l)}{plate(*r, right=True)}</div>'


def tk_row(state, ok=False):
    """TK-F1 timekeeper row on the athlete face-off: TIMEKEEPER, name, state (TK-F2 / TK-F3)."""
    c = INK if ok else AMBER
    mark = (mono("✓", 12, INK, 700, 0, False) if ok else f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>')
    return (f'<div aria-label="Timekeeper {TK}, {state.lower()}" style="min-height: 48px; box-sizing: border-box; padding: 8px 12px; display: flex; flex-direction: row; align-items: center; gap: 12px; '
            f'background: {PANEL}; border: 1px solid {HL}; border-radius: 3px">'
            f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">'
            f'{mono("J·C", 10, INK, 700, 1.68, False)}</span>'
            f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px">{mono("TIMEKEEPER", 10, INK3, 500, 2.52)}{heading(TK, 14, INK)}</div>'
            f'{row(mark + mono(state, 10, c, 700, 1.68), 7)}</div>')


def rec_panel(sub, on=True, locked=False):
    knob = "flex-end" if on else "flex-start"
    bg = INK if on else BRIGHT
    kn = VOID if on else INK3
    op = " opacity: 0.5;" if locked else ""
    return (f'<div style="min-height: 56px; box-sizing: border-box; padding: 0 14px; display: flex; flex-direction: row; align-items: center; gap: 12px; background: {PLATE}; border: 1px solid {HL}; border-radius: 3px">'
            f'<div style="flex: 1; display: flex; flex-direction: column; gap: 4px">{heading("Record from my phone", 13, INK, True, 1.12)}{mono(sub, 10, INK, 500, 2.52)}</div>'
            f'<button type="button" role="switch" aria-checked="{"true" if on else "false"}" aria-label="Record from my phone" style="width: 51px; height: 31px; box-sizing: border-box; padding: 2px; border: none; border-radius: 16px; background: {bg}; display: flex; align-items: center; justify-content: {knob}; cursor: pointer;{op}">'
            f'<span style="width: 27px; height: 27px; border-radius: 14px; background: {kn}"></span></button></div>')


def camera():
    return (f'<div aria-label="Camera preview" style="width: 100%; aspect-ratio: 16 / 9; box-sizing: border-box; border: 1px solid {HLS}; border-radius: 4px; background: {PLATE}; '
            f'display: flex; align-items: center; justify-content: center; flex-shrink: 0">{mono("CAMERA PREVIEW (UNCHANGED, BOARD 22)", 10, PH, 500, 2)}</div>')


def center_line(t, color=INK, size=11):
    return f'<div style="display: flex; justify-content: center">{mono(t, size, color, 700, 1.68)}</div>'


def deadline_chip(t="9:12", red=False):
    """TK-W1. PromptCountdown type (mono 13 bold, 0.5 tracking) on an attention rule; signal red at 2:00 and under."""
    c, b = (NEG, RED) if red else (AMBER, AMBER_RULE)
    m, s = t.split(":")
    return (f'<span role="timer" aria-label="Match cancels in {int(m)} minutes {int(s)} seconds" style="display: inline-flex; align-items: center; gap: 6px; height: 28px; box-sizing: border-box; padding: 0 9px; '
            f'border: 1px solid {b}; border-radius: 2px; flex-shrink: 0">{ic("timer", 13, c)}'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 13px; line-height: 17px; letter-spacing: 0.5px; font-variant-numeric: tabular-nums; color: {c}; white-space: nowrap">CANCELS IN {t}</span></span>')


# ---- picker atoms (friends.tsx row look) ----
def initials(name):
    parts = name.replace(".", "").split()
    return f"{parts[0][0]}·{parts[-1][0]}"


def presence(kind):
    if kind == "live":
        return row(f'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 3.5px; background: {GREEN}; flex-shrink: 0"></span>' + mono("LIVE", 10, GREEN, 700, 2.52), 7)
    if kind == "online":
        return f'<span aria-label="Online" style="width: 7px; height: 7px; box-sizing: border-box; border-radius: 3.5px; border: 1.5px solid {GREEN}; flex-shrink: 0; display: block"></span>'
    return ""


def picker_row(name, elo, pres="", friend_of=None, action="ask", busy=None, dim=False):
    """CANONICAL timekeeper picker row (Friends list look, app/(app)/friends.tsx), shared by every P-TK board.
    name: full display name ("Jordan Cruz"); elo: int; pres: "live" (green dot + LIVE) | "online" (hollow green ring) | "";
    friend_of: the OTHER athlete's short name for the TK-P5b caption, or None; action: "ask" | "ask-off" (disabled) | None;
    busy: TK-P8 / TK-P9 text replacing Ask; dim: fade the row while a request is open."""
    sub = mono(f"{elo} ELO", 12, INK3, 400, 0, False)
    fo = f'<span style="margin-top: 2px">{body(friend_of + chr(39) + "s friend", 12, INK3)}</span>' if friend_of else ""
    if busy:
        right = mono(busy, 10, AMBER, 700, 1.12, False, "white-space: normal; text-align: right; max-width: 120px")
    elif action == "ask":
        right = btn_outline_small("Ask", f"Ask {name} to timekeep")
    elif action == "ask-off":
        right = btn_outline_small("Ask", f"Ask {name} to timekeep", disabled=True)
    else:
        right = ""
    op = " opacity: 0.45;" if dim else ""
    return (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10.5px; border-radius: 3px; background: {PANEL}; padding: 10.5px;{op}">'
            f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">'
            f'{mono(initials(name), 10, INK, 700, 1.68, False)}</span>'
            f'<span style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column">{heading(name, 14, INK, extra="white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}{sub}{fo}</span>'
            f'{presence(pres)}{right}</div>')


def section(t):
    return f'<h2 style="margin: 6px 0 0; font-family: {MONO}; font-weight: 400; font-size: 11px; line-height: 14px; text-transform: uppercase; letter-spacing: 1.68px; color: {INK3}">{q(t)}</h2>'


def empty_line(t):
    return f'<p style="margin: 0; padding: 10px 0; border-top: 1px dashed {HL}; border-bottom: 1px dashed {HL}">{body(t, 13, INK2)}</p>'


def search_field(value=None):
    v = (f'<span style="font-family: {INTER}; font-size: 14px; color: {INK}">{q(value)}</span>' if value
         else f'<span style="font-family: {INTER}; font-size: 14px; color: {INK3}">Search friends and nearby</span>')
    bd = INK2 if value else HLS
    clear = f'<span style="flex: 1"></span>{ic("x", 16, INK3)}' if value else ""
    return (f'<div role="search" style="height: 44px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; gap: 8px; background: {PLATE}; '
            f'border: 1px solid {bd}; border-radius: 3px; flex-shrink: 0">{ic("search", 16, INK3)}{v}{clear}</div>')


def phase2_row():
    return (f'<div aria-disabled="true" style="display: flex; flex-direction: row; align-items: center; gap: 10.5px; border-radius: 3px; border: 1px dashed {HLS}; padding: 10.5px; opacity: 0.55">'
            f'<span aria-hidden="true" style="width: 28px; height: 28px; box-sizing: border-box; border-radius: 2px; border: 1px dashed {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0">{ic("userplus", 15, INK2)}</span>'
            f'<span style="flex: 1; min-width: 0">{heading("Invite someone not on ELO RATED", 13, INK2)}</span>{phase2_chip()}</div>')


def picker_title(chip="9:12", red=False):
    return (row(heading("Pick a timekeeper", 20, INK, tag="h1") + deadline_chip(chip, red), 10, "center", "space-between")
            + f'<p style="margin: -6px 0 0">{body("They start the match, run the clock and record the result. They can" + chr(39) + "t be either of you.", 13, INK2)}</p>')


FRIENDS = [("Jordan Cruz", 1301, "live", B), ("Sam Whitfield", 1620, "online", None), ("Priya Shah", 1455, "", A)]
NEARBY = [("Leo Tanaka", 1440, "live"), ("Kenji Mori", 1388, "live")]


def friends_rows(action="ask", dim=False, me=A):
    return "".join(picker_row(n, e, p, fo if fo and fo != me else None, action, dim=dim) for n, e, p, fo in FRIENDS)


def nearby_rows(action="ask", dim=False):
    return "".join(picker_row(n, e, p, None, action, dim=dim) for n, e, p in NEARBY)


def pending_card(title, sub="Waiting for them to accept."):
    dot = f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>'
    return (f'<div role="status" style="box-sizing: border-box; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: {PLATE}; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'{row(dot + heading(title, 16, INK), 9)}{f"<p style=\"margin: 0\">{body(sub, 13, INK2)}</p>" if sub else ""}{btn_sec("Ask someone else", 44)}</div>')


def approval_card():
    """TK-P25 to TK-P27 (Q12, pending owner): the other athlete approves the pick before it is sent."""
    dot = f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>'
    return (f'<div role="alert" style="box-sizing: border-box; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: {PLATE}; border: 1px dashed {AMBER}; border-radius: 3px">'
            f'{row(dot + heading(f"{A} picked {TK}. OK with you?", 16, INK), 9, "flex-start")}'
            f'{picker_row("Jordan Cruz", 1301, "live", None, action=None)}'
            f'<div style="display: flex; gap: 12px">{btn_sec("Not this one", 48, extra="flex: 1 1 0")}{btn_red("Approve", 48).replace("height: 48px;", "flex: 1 1 0; height: 48px;")}</div></div>')


def notice(t, tone=AMBER):
    return (f'<div role="alert" style="min-height: 44px; box-sizing: border-box; padding: 10px 12px; display: flex; flex-direction: row; align-items: center; gap: 8px; border: 1px dashed {tone}; border-radius: 3px">'
            f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {tone}; flex-shrink: 0"></span>{body(t, 13, tone, extra="flex: 1")}</div>')


# =========================================================== BOARDS
BOARDS = []


def board(file, title, w=390):
    def deco(fn):
        BOARDS.append((file, title, w, fn))
        return fn
    return deco


# ---------- row-board layout (same as gen_a.py / gen_b2.py: 48 px padding, 40 px gap, captions under each frame) ----------
PAD, GAP, PHONE_W, PHONE_H = 48, 40, 390, 844


def fr(step, title, inner, notes=(), copy="", chips=()):
    return {"step": step, "title": title, "inner": inner, "notes": list(notes), "copy": copy, "chips": list(chips)}


def phone_box(inner):
    return (f'<div style="width: {PHONE_W}px; height: {PHONE_H}px; flex-shrink: 0; position: relative; overflow: hidden; border: 1px solid {HLS}; border-radius: 4px; box-sizing: content-box; background: {VOID}">'
            f'{inner}</div>')


def frame_cell(f):
    notes = "".join(f'<p style="margin: 0">{body(n, 12, INK2)}</p>' for n in f["notes"])
    copy = mono("copy: " + f["copy"], 10, INK3, 400, 0.4, False, "white-space: normal; overflow-wrap: anywhere") if f["copy"] else ""
    return (f'<div style="width: {PHONE_W + 2}px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0">{phone_box(f["inner"])}'
            f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 0 2px">'
            f'<div style="display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap">{mono(f["step"], 11, INK, 700, 2.52)}{"".join(f["chips"])}</div>'
            f'{heading(f["title"], 15, INK)}{notes}'
            f'<div style="padding-top: 6px; border-top: 1px solid {HLF}">{copy}</div></div></div>')


def row_board(tags, kicker, title, intro, frames, notes=None, notes_title="Notes"):
    n = len(frames)
    w = PAD * 2 + n * (PHONE_W + 2) + (n - 1) * GAP
    head = (f'<div style="padding: {PAD}px {PAD}px 0; display: flex; flex-direction: column; gap: 10px">'
            f'<div style="display: flex; flex-direction: row; gap: 12px; align-items: center; flex-wrap: wrap">{"".join(tags)}{mono(kicker, 10, INK3)}</div>'
            f'{heading(title, 32, INK, tag="h1")}<p style="margin: 0; max-width: 1100px">{body(intro, 15, INK2)}</p></div>')
    cells = "".join(frame_cell(f) for f in frames)
    nb = ""
    if notes:
        nb = (f'<div style="padding: 8px {PAD}px {PAD}px; display: flex; flex-direction: column; gap: 8px; max-width: 1400px">'
              f'{heading(notes_title, 15, INK)}{bullets(notes, 13)}</div>')
    inner = head + f'<div style="padding: 32px {PAD}px {24 if notes else PAD}px; display: flex; flex-direction: row; gap: {GAP}px; align-items: flex-start">{cells}</div>' + nb
    return w, inner


KICK = "SPEC.md section B · COPY-DECK.md · sample: M. Reyes 1512 / 172.5, D. Okafor 1487 / 171.4, J. Cruz"


# ---------- B1 Arena copy ----------
def challenge_sheet(promise, stakes_on=True):
    st = col(mono(f"YOUR STAKES · {B_ELO}", 10, INK3, 500, 2.52) + stakes(*STAKES_B, 64, VOID), 8) if stakes_on else ""
    pr = f'<p style="margin: 0">{body(promise, 13, INK)}</p>'
    btn = f"font-family: {DM}; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1.12px"
    dialog = (f'<div role="dialog" aria-modal="true" aria-label="Incoming challenge" style="box-sizing: border-box; background: {PLATE}; border: 1px solid {HLS}; border-radius: 8px; padding: 24px 16px; display: flex; flex-direction: column; gap: 28px">'
              f'{row(mono("INCOMING CHALLENGE", 10, INK3, 700, 2.52) + mono("9:42 LEFT", 13, INK, 700, 0.5, False), 10, "center", "space-between")}'
              f'<div style="display: flex; align-items: center; gap: 16px"><div aria-hidden="true" style="width: 88px; height: 88px; box-sizing: border-box; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {BRIGHT}; border: 1px solid {HLS}; border-radius: 2px; font-family: {DM}; font-weight: 700; font-size: 30px; letter-spacing: 1.12px; color: {INK}">MR</div>'
              f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px"><span style="font-family: {BEBAS}; font-size: 44px; line-height: 42px; color: {INK}; white-space: nowrap">{A}</span>'
              f'{mono(f"ELO {A_ELO} · {A_W} LBS", 13, INK2, 400, 0, False)}{body(f"{A} is live in the Arena", 13, INK2)}</div></div>'
              f'{st}{pr}'
              f'<div style="display: flex; flex-direction: column; gap: 4px"><div style="display: flex; gap: 12px">'
              f'<a href="#" aria-label="Decline challenge" style="flex: 1 1 0; height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 3px; border: 1px solid {HLS}; color: {INK}; {btn}">Decline</a>'
              f'<a href="{href("P-TK-B2-Picker")}" aria-label="Accept challenge" style="flex: 2 1 0; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 3px; background: {RED}; color: {VOID}; {btn}">Accept</a></div>'
              f'<div style="height: 44px; display: flex; align-items: center; justify-content: center"><span style="font-family: {DM}; font-weight: 700; font-size: 14px; color: {INK2}; text-decoration: underline">Later</span></div></div></div>')
    return frame(f'<div style="position: relative; flex: 1; box-sizing: border-box; background: rgba(0,0,0,0.55); padding: 0 16px; display: flex; flex-direction: column; justify-content: center">'
                 f'<div aria-hidden="true" style="position: absolute; top: 60px; left: 0; right: 0; display: flex; justify-content: center">{mono("ARENA BEHIND THE SCRIM", 10, PH, 500, 2)}</div>'
                 f'<div style="position: relative">{dialog}</div></div>')


def waiting_strip(extra_line=None):
    line = f'<p style="margin: 6px 0 0; padding-left: 3px">{body(extra_line, 13, INK2)}</p>' if extra_line else ""
    return (f'<div style="display: flex; flex-direction: column"><div style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; gap: 10.5px; border-radius: 2px; border: 1px solid {HL}; border-left: 3px solid {INK3}; background: {PANEL}; padding: 5.25px 7px 5.25px 10.5px">'
            f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: row; align-items: center" aria-label="Waiting for {B}">{mono(f"Waiting · {B}", 11, INK, 700, 0)}{mono(" · 9:12", 11, INK, 700, 0, extra="white-space: pre")}</span>'
            f'<a href="#" aria-label="Cancel challenge" style="height: 28px; box-sizing: border-box; display: flex; align-items: center; border-radius: 2px; border: 1px solid {HLS}; padding: 0 10.5px; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 1.12px; color: {INK}">Cancel</a></div>{line}</div>')


def arena_phone(strip):
    ghost = "".join(f'<div style="height: 56px; box-sizing: border-box; border: 1px dashed {HL}; border-radius: 3px"></div>' for _ in range(4))
    return phone(mono("ARENA · MAT BOARD (UNCHANGED ABOVE AND BELOW)", 10, PH, 500, 2) + strip
                 + f'<div style="height: 120px; box-sizing: border-box; border: 1px dashed {HL}; border-radius: 4px"></div>' + col(ghost, 8), gap=14)


@board("P-TK-B1-Arena-Copy.dc.html", "Proposed: Timekeeper mode, Arena with the flag on (TK-AR1, TK-AR2)", w=None)
def b1():
    frames = [
        fr("1 · OPPONENT", f"{B}'s phone: incoming challenge, stakes shown", challenge_sheet("Accept, then pick a timekeeper together."),
           ["TK-AR1 sits under the stakes strip (body, ink). In shipped code (challenge-prompt-sheet.tsx:476-484) the line Accept and you both drop straight into the match. renders ONLY when stakes are missing, so a straight swap would almost never show; the board review endorsed this placement (M5)."],
           "TK-AR1; shipped INCOMING CHALLENGE, {m:ss} LEFT, {name} is live in the Arena, YOUR STAKES · {elo}, Decline, Accept, Later", [TAG_B]),
        fr("2 · OPPONENT", "Same sheet, stakes missing", challenge_sheet("Accept, then pick a timekeeper together.", stakes_on=False),
           ["TK-AR1 replaces the shipped fallback line in place."], "TK-AR1", [TAG_B]),
        fr("3 · CHALLENGER", f"{A}'s phone: challenge sent, the Arena strip", arena_phone(waiting_strip("You" + chr(39) + "ll both pick a timekeeper the moment they accept.")),
           ["The real challenger sees the mat-board strip Waiting · {name} · m:ss (mat-board.tsx:382), which has no body line, so TK-AR2 is a helper line under it, flag known ON only.",
            "WaitingPlate (arena-plates.tsx), home of You'll both drop into the match the moment they accept., is used only by the practice match, never timekeeper mode, and stays unchanged."],
           "TK-AR2; shipped Waiting · {name}, Cancel", [TAG_B]),
        fr("4 · FLAG UNKNOWN OR OFF", "Shipped copy, unchanged",
           phone(mono("CHALLENGE SHEET, STAKES MISSING (SHIPPED LINE)", 10, PH, 500, 2) + body("Accept and you both drop straight into the match.", 13, INK2)
                 + mono("ARENA STRIP (SHIPPED)", 10, PH, 500, 2, extra="margin-top: 16px") + waiting_strip(), gap=12),
           ["FE-1 is fail-closed: until the flag is known ON the shipped copy shows.",
            "Capability rule (B.0): the match is timekeeper mode only when the flag is on AND both athletes' clients advertised p_client_supports_timekeeper. If the other build is older, TK-AR1 / TK-AR2 promise a timekeeper and the match falls back to the two-athlete flow; nothing breaks (owner question Q13, recommended keep)."],
           "shipped challenge-prompt-sheet.tsx:484, mat-board.tsx:382"),
    ]
    return row_board([TAG_B], KICK, "Arena with the flag on",
                     "Before the match exists only two lines change, and only when the client knows the flag is ON. The server snapshot (requires_timekeeper) decides the actual mode. On Accept both phones go to the new wizard step crew (board P-TK-B2) instead of the weigh-in; the challenger gets the shipped Challenge Accepted push.",
                     frames)


# ---------- B2 picker ----------
def picker_phone(me=A, mid="", search=None, rows_action="ask", dim=False, chip="9:12", red=False, scrolled=False):
    """scrolled=True (a card is open above the list): the list runs past the fold, so only the first Nearby row shows."""
    inner = top_bar("FACE-OFF · TIMEKEEPER") + fight_chip(me) + picker_title(chip, red) + mid + search_field(search)
    inner += section("Friends") + col(friends_rows(rows_action, dim, me), 8)
    nb = nearby_rows(rows_action, dim)
    if scrolled:
        n, e, pz = NEARBY[0]
        nb = picker_row(n, e, pz, None, rows_action, dim=dim)
    inner += section("Nearby") + col(nb, 8)
    if not scrolled:
        inner += phase2_row()
    return phone(inner, pad="55px 16px 24px 16px", gap=10)


@board("P-TK-B2-Picker.dc.html", "Proposed: Timekeeper mode, pick a timekeeper (default, search, pending, other athlete, Q12 approval)", w=None)
def b2():
    frames = [
        fr("1 · CHALLENGER", f"Default, deadline 9:12", picker_phone(),
           ["Rows reuse the Friends list row (app/(app)/friends.tsx): 28 pt initials tile, full name, {elo} ELO, LIVE with the green dot when on the mat; a hollow green ring is the app:online overlay (a11y label only).",
            "Jordan Cruz is D. Okafor's friend, so he carries TK-P5b. Nearby shows bands only, never a distance.",
            "The PHASE 2 row is drawn disabled and not built in phase 1 (section P)."],
           "TK-P1 to TK-P7, TK-P10, TK-P11 (tag), TK-W1", [TAG_B]),
        fr("2 · CHALLENGER", "Search typed", phone(top_bar("FACE-OFF · TIMEKEEPER") + fight_chip() + picker_title("8:47") + search_field("cru")
                                                  + section("Friends") + picker_row("Jordan Cruz", 1301, "live", B) + phase2_row(), pad="55px 16px 24px 16px", gap=10),
           ["Filters the loaded lists on the device. A section with no match hides its header; the Phase 2 row stays last."], "TK-P4, TK-P5, TK-P5b", [TAG_B]),
        fr("3 · CHALLENGER", f"Request pending: Asked {TK}", picker_phone(mid=pending_card(f"Asked {TK}"), rows_action="ask-off", dim=True, chip="8:31", scrolled=True),
           ["One request is open per match, so every Ask is disabled until it resolves. Ask someone else withdraws it (cancel_timekeeper_request; the asked person's sheet closes silently).",
            "The deadline keeps running; the request lapses after 2 minutes (board P-TK-B3).", "With a card open the list runs past the fold (frames 3 to 6); the rest of Nearby and the Phase 2 row follow below, as in frame 1."], "TK-P17, TK-P18, TK-P19", [TAG_B]),
        fr("4 · OPPONENT", f"The other athlete's view: {A} asked {TK}", picker_phone(me=B, mid=pending_card(f"{A} asked {TK}"), rows_action="ask-off", dim=True, chip="8:31", scrolled=True),
           ["Follows live (realtime on match_timekeeper_requests, scoped to the parties); he can also Ask someone else.",
            "On his phone TK-P5b flips: Priya Shah reads as M. Reyes's friend and Jordan Cruz carries none."], "TK-P20, TK-P19", [TAG_B]),
        fr("5 · OPPONENT", "Q12: approve the pick before it is sent", picker_phone(me=B, mid=approval_card(), rows_action="ask-off", dim=True, chip="8:44", scrolled=True),
           [f"If the owner accepts Q12, {A}'s pick reaches {B} first as a one-tap card; only once approved is the request sent to {TK} (approve_timekeeper_request; requested_by and approved_by recorded). Not this one returns both athletes to the list. Same for mid-match replacements and code joins.",
            f"Meanwhile {A}'s phone shows frame 6, not frame 3: the request is not sent yet."],
           "TK-P25, TK-P26, TK-P27 (Q12)", [TAG_B, TAG_PENDING]),
        fr("6 · CHALLENGER", f"Q12: waiting for {B} to approve", picker_phone(mid=pending_card(f"Waiting for {B} to approve.", None), rows_action="ask-off", dim=True, chip="8:44", scrolled=True),
           [f"The picking athlete's card while the other athlete approves (frame 5). Ask someone else withdraws the pick. Approve sends the request to {TK} and this card becomes frame 3; Not this one returns both athletes to the list."],
           "TK-P28, TK-P19 (Q12)", [TAG_B, TAG_PENDING]),
    ]
    return row_board([TAG_B], KICK, "Pick a timekeeper (new wizard step crew)",
                     "Both athletes land here after Accept (pending + requires_timekeeper + no accepted timekeeper). Either athlete can ask; the first request wins and the other phone follows live. One read feeds the list: get_timekeeper_candidates(p_match_id), friends of EITHER athlete plus live athletes near the match, minus both athletes, bots, busy people and anyone holding another open request. Picker rows are the canonical component (picker_row) for every board on this page.",
                     frames)


# ---------- B3 picker states ----------
def picker_body(mid="", friends=None, nearby=None, chip="7:05", red=False, search=None, after_search=""):
    inner = top_bar("FACE-OFF · TIMEKEEPER") + picker_title(chip, red) + mid + search_field(search) + after_search
    if friends is not None:
        inner += section("Friends") + friends
    if nearby is not None:
        inner += section("Nearby") + nearby
    inner += phase2_row()
    return phone(inner, pad="55px 16px 24px 16px", gap=10)


@board("P-TK-B3-Picker-States.dc.html", "Proposed: Timekeeper mode, picker empty, busy, declined, lapsed, accepted, under 2:00", w=None)
def b3():
    frames = [
        fr("1", "No friends", picker_body(friends=empty_line("No friends yet. Nearby athletes can timekeep too."), nearby=col(nearby_rows(), 8)), [], "TK-P12", [TAG_B]),
        fr("2", "Nobody nearby", picker_body(friends=col(friends_rows(), 8), nearby=empty_line("Nobody else on the mat right now.")), [], "TK-P13", [TAG_B]),
        fr("3", "Both empty", picker_body(mid=(f'<div style="padding: 24px 8px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; border: 1px dashed {HL}; border-radius: 3px">'
                                               f'{ic("userplus", 22, INK3)}{body("Nobody to ask yet. Ask someone at your gym to open ELO RATED and go live.", 13, INK2)}</div>')),
           ["Both sections hide; one panel replaces them. The Phase 2 row stays (it becomes the answer here once built)."], "TK-P14", [TAG_B]),
        fr("4", "Search, no result", picker_body(search="zz", after_search=f'<p style="margin: 0; padding: 12px 0; text-align: center">{body("No one by that name.", 13, INK2)}</p>'), [], "TK-P15", [TAG_B]),
        fr("5", "Load error", picker_body(mid=(f'<div style="padding: 20px 8px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center">'
                                               f'{ic("wifioff", 20, NEG)}{body("Couldn" + chr(39) + "t load people to ask.", 13, NEG)}{btn_sec("Try again", 44, extra="min-width: 160px")}</div>')), [], "TK-P16", [TAG_B]),
        fr("6", "Row turned busy (Ask refused)", picker_body(friends=col(picker_row("Jordan Cruz", 1301, "live", B, busy="Timekeeping another match") + picker_row("Sam Whitfield", 1620, "online")
                                                                         + picker_row("Priya Shah", 1455, "", None, busy="Running their own match"), 8), nearby=col(nearby_rows(), 8)),
           ["request_match_timekeeper returned {ok:false, code: timekeeper_busy}. The server already leaves busy people out, so this appears only after a race; the list re-reads on focus."], "TK-P8, TK-P9", [TAG_B]),
        fr("7", f"Declined: {TK} can't timekeep", picker_body(mid=notice(f"{TK} can" + chr(39) + "t timekeep. Pick someone else."), friends=col(friends_rows(), 8), nearby=col(nearby_rows(), 8), chip="6:12"),
           ["The list returns as it was (SPEC B.2); nothing is assumed about leaving the decliner out. The deadline keeps running. Push TK-N3 only if the app is in the background."], "TK-P21", [TAG_B]),
        fr("8", "Lapsed: no answer in 2 minutes", picker_body(mid=notice(f"{TK} didn" + chr(39) + "t answer. Pick someone else."), friends=col(friends_rows(), 8), nearby=col(nearby_rows(), 8), chip="5:40"), [], "TK-P22", [TAG_B]),
        fr("9", "Accepted (about 1 second)", phone(f'<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center">'
                                                    f'<span aria-hidden="true" style="width: 56px; height: 56px; box-sizing: border-box; border-radius: 2px; border: 1px solid {HLS}; background: {BRIGHT}; display: flex; align-items: center; justify-content: center">{mono("J·C", 16, INK, 700, 1.68, False)}</span>'
                                                    f'{heading(f"{TK} is your timekeeper", 22, INK, tag="h1")}</div>'),
           ["The deadline is cleared. Athletes go to the weigh-in (board P-TK-B5); the timekeeper's phone opens the timekeeper face-off (board P-TK-B6)."], "TK-P23", [TAG_B]),
        fr("10", "Deadline at 2:00 and under", picker_body(friends=col(friends_rows(), 8), nearby=col(nearby_rows(), 8), chip="1:48", red=True),
           ["Negative text on a signal-red rule. At 0:00 the server cancels: toast Match cancelled / TK-W2 (board P-TK-B9), push TK-N4."], "TK-W1", [TAG_B]),
    ]
    return row_board([TAG_B], KICK, "Picker states", "Empty, error, busy, declined, lapsed, accepted and the last two minutes. The fight chip is left out on these frames to save space; it is as on board P-TK-B2.", frames)


# ---------- B4 the asked person ----------
def push_card(title, text):
    return (f'<div style="background: rgba(38,42,52,0.92); border-radius: 18px; padding: 12px 14px; display: flex; flex-direction: row; gap: 10px; align-items: flex-start">'
            f'<span aria-hidden="true" style="width: 34px; height: 34px; border-radius: 8px; background: {VOID}; border: 1px solid {HLS}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: {DM}; font-weight: 700; font-size: 12px; color: {INK}; white-space: nowrap">E<span style="color: {RED}">·</span>R</span>'
            f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">{row(mono("ELO RATED", 10, INK2, 500, 1.12) + mono("now", 10, INK3, 400, 0, False), 6, "center", "space-between")}'
            f'{heading(title, 14, INK)}{body(text, 13, INK)}</div></div>')


def ask_sheet(countdown="1:42"):
    btn = f"font-family: {DM}; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1.12px"
    btns = (f'<div style="display: flex; gap: 12px"><a href="#" aria-label="Decline timekeeping" style="flex: 1 1 0; height: 56px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 3px; border: 1px solid {HLS}; color: {INK}; {btn}">Decline</a>'
            f'<a href="{href("P-TK-B6-Timekeeper-Faceoff")}" aria-label="Accept timekeeping" style="flex: 2 1 0; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 3px; background: {RED}; color: {VOID}; {btn}">Accept</a></div>')
    timer = f'<span role="timer" aria-label="1 minute 42 seconds left to answer">{mono("ANSWER IN " + countdown, 13, INK, 700, 0.5, False)}</span>'
    return (f'<div role="dialog" aria-modal="true" aria-label="Timekeep this match?" style="box-sizing: border-box; background: {PLATE}; border: 1px solid {HLS}; border-radius: 8px; padding: 24px 16px; display: flex; flex-direction: column; gap: 24px">'
            f'{row(heading("Timekeep this match?", 20, INK, tag="h1") + timer, 10, "center", "space-between")}'
            f'{fight_chip(A, you_dot=False, elo_only=True)}'
            f'<p style="margin: 0">{body("You start the match, run the clock and record the result. Your rating isn" + chr(39) + "t affected.", 14, INK2)}</p>{btns}</div>')


@board("P-TK-B4-Timekeeper-Ask.dc.html", "Proposed: Timekeeper mode, the asked person (push, Timekeep this match?, closed, entering)", w=None)
def b4():
    frames = [
        fr("1 · ASKED PERSON", "Push on the lock screen",
           frame(f'<div style="flex: 1; box-sizing: border-box; padding: 80px 12px 24px; background: linear-gradient(180deg, #1A1D25 0%, #0D0F14 100%); display: flex; flex-direction: column; align-items: center; gap: 4px">'
                 f'{mono("Thursday 15 October", 13, INK, 500, 0, False)}<span style="font-family: {INTER}; font-weight: 500; font-size: 72px; line-height: 80px; color: {INK}">7:41</span>'
                 f'<div style="width: 100%; margin-top: 40px">{push_card(f"Timekeep {A} vs {B}?", f"{A} asked you to start the match, run the clock and record the result.")}</div></div>'),
           ["Kind timekeeper_requested, category matches (not friends, which a user may mute). No action buttons: a tap opens the sheet on the non-tab-root route /match/[matchId]/timekeep."], "TK-N1", [TAG_B]),
        fr("2 · ASKED PERSON", "Timekeep this match?",
           frame(f'<div style="flex: 1; box-sizing: border-box; background: rgba(0,0,0,0.55); padding: 0 16px; display: flex; flex-direction: column; justify-content: center">{ask_sheet()}</div>'),
           ["Incoming challenge sheet look: PromptCountdown type for ANSWER IN (the 2-minute request), Decline outline (1 part), Accept red (2 parts). The fight chip shows both athletes with ELOs and no you-mark: the timekeeper is neither. In the app the same sheet opens from the realtime row.",
            "Decline calls respond_timekeeper_request(false); the athletes see TK-P21."], "TK-T1 to TK-T5", [TAG_B]),
        fr("3 · ASKED PERSON", "Request no longer open",
           phone(toast("This request is no longer open.", tone=AMBER) + f'<div style="flex: 1; display: flex; align-items: center; justify-content: center; border: 1px dashed {HL}; border-radius: 3px">{mono("PREVIOUS SCREEN", 10, PH, 500, 2)}</div>', pad="60px 16px 34px"),
           ["Withdrawn, lapsed, another request accepted first, or they started their own match (request_closed, timekeeper_busy). The sheet closes and the toast says why; a lapsed push lands here too."], "TK-T6", [TAG_B]),
        fr("4 · TIMEKEEPER", "Accepted: entering the match",
           phone(top_bar("FACE-OFF · TIMEKEEPER") + fight_chip(A, you_dot=False)
                 + f'<div style="flex: 1; padding: 28px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; border: 1px dashed {HL}; border-radius: 3px">'
                 f'{mono("TIMEKEEPER FACE-OFF", 10, INK3, 700, 2.52)}<a href="{href("P-TK-B6-Timekeeper-Faceoff")}" style="color: {NEG}">{mono("CONTINUES ON BOARD P-TK-B6", 10, NEG, 700, 1.68)}</a></div>'),
           ["Accept runs _set_match_timekeeper (the same core as join_match_as_timekeeper) and clears the deadline. The in-person code/QR join follows the same rules (busy, deadline, Q12 approval), pushes both athletes and is refused once the match has started.",
            "The timekeeper is never a match_participants row."], "TK-K0", [TAG_B]),
    ]
    return row_board([TAG_B], KICK, f"The asked person ({TK}'s phone)",
                     "A request is a match_timekeeper_requests row with a 2-minute expiry. The asked person answers on their own phone, from a push or from the realtime row in the app.", frames)


# ---------- B5 athlete face-off ----------
@board("P-TK-B5-Athlete-Faceoff.dc.html", "Proposed: Timekeeper mode, athlete face-off with the merged ready", w=None)
def b5():
    gapline = (f'<div style="height: 32px; flex-shrink: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-top: 1px solid {HL}; border-bottom: 1px solid {HL}">'
               f'{mono("1.1 LBS APART · SAME DIVISION", 11, INK2, 500, 2.52)}</div>')

    def ready_phone(pl, tkstate, tk_ok, bottom, locked=False):
        return phone(top_bar("FACE-OFF · READY") + fight_chip() + camera() + rec_panel(f"{B.upper()} RECORDING", locked=locked)
                     + plates(*pl) + tk_row(tkstate, tk_ok) + bottom, pad="55px 16px 24px 16px", gap=12)
    rew = (f'<div style="display: flex; flex-direction: row; align-items: center; gap: 10px">'
           f'<input type="text" inputmode="decimal" value="{A_W}" aria-label="Your new weight in pounds" style="width: 96px; height: 56px; box-sizing: border-box; padding: 0 10px; margin: 0; flex-shrink: 0; font-family: {MONO}; font-weight: 700; font-size: 18px; color: {INK}; background: {PLATE}; border: 1px solid {HLS}; border-radius: 3px; outline: none">'
           f'{mono("LBS", 10, INK2, 500, 2.52)}<a href="#" style="flex: 1; height: 56px; background: {RED}; color: {VOID}; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase">Re-weigh</a></div>')
    frames = [
        fr("1 · ATHLETE", "Weigh-in (shipped) with the timekeeper row",
           phone(top_bar("FACE-OFF · WEIGH IN") + fight_card() + gapline + stakes()
                 + plates(("CONFIRM WEIGHT", "wait"), (f"{B.upper()} WEIGHING IN", "wait")) + tk_row("CHECKING WEIGHTS") + btn_red(f"Confirm {A_W} lbs", 64), pad="55px 16px 24px 16px", gap=12),
           ["Everything above the timekeeper row is shipped (board 21). The opponent plate stays WEIGHING IN, then WEIGHED IN: no YOUR CHECK here, because the check moved to step 2.",
            "The timekeeper row reads CHECKING WEIGHTS until the timekeeper has confirmed both athletes."], "TK-F1, TK-F2; shipped Confirm {w} lbs", [TAG_B]),
        fr("2 · ATHLETE", "Ready: opponent weight line and the merged button",
           ready_phone((("YOU · NOT READY", "wait"), (f"{B.upper()} · NOT READY", "wait")), "CHECKING WEIGHTS", False,
                       col(center_line(f"{B.upper()} WEIGHED IN AT {B_W} LBS")
                           + f'<span style="align-self: center">{body(f"{TK} starts the match once you" + chr(39) + "re both ready.", 13, INK2)}</span>'
                           + btn_red("Weight looks right, I" + chr(39) + "m ready", 64) + btn_sec("Doesn" + chr(39) + "t look right", 48), 8)),
           ["One tap confirms my check of the opponent and marks me ready, server side (mark_match_ready with p_confirm_opponent_weight).",
            "Doesn't look right opens the shipped flag flow (board 21b). TK-F6 replaces Match starts when you both tap ready."], "TK-F4, TK-F6; shipped {OPP} WEIGHED IN AT {w} LBS, Doesn't look right", [TAG_B]),
        fr("3 · ATHLETE", "Waiting for the opponent",
           ready_phone((("YOU · READY", "ok"), (f"{B.upper()} · NOT READY", "wait")), "CHECKING WEIGHTS", False, center_line(f"WAITING FOR {B.upper()}...", INK2), locked=True),
           ["The recording switch locks on ready, as today. Any re-weigh clears both athletes' ready; any flag clears the ready server side."], "shipped WAITING FOR {OPP}...", [TAG_B]),
        fr("4 · ATHLETE", f"Both ready: {TK.upper()} STARTS THE MATCH",
           ready_phone((("YOU · READY", "ok"), (f"{B.upper()} · READY", "ok")), "WEIGHTS CONFIRMED", True, center_line(f"{TK.upper()} STARTS THE MATCH", INK), locked=True),
           ["No auto-start: both phones wait for the timekeeper's Start (board P-TK-B6), then the shared countdown with SYNCED TO SERVER CLOCK · ALL PHONES."], "TK-F3, TK-F5", [TAG_B]),
        fr("5 · ATHLETE", "The timekeeper flagged my weight: re-weigh",
           ready_phone((("YOU · NOT READY", "wait"), (f"{B.upper()} · READY", "ok")), "CHECKING WEIGHTS", False,
                       col(notice(f"{TK} says your weight doesn" + chr(39) + "t look right. Re-weigh to continue.") + rew, 10)),
           ["Pending owner (Q1): a timekeeper flag blocks the start until this athlete re-weighs and the timekeeper confirms again, the same as today's athlete flag.",
            "In timekeeper mode a re-weigh (for any reason) voids EVERY check whose subject is me (my opponent's check and the timekeeper's confirmation) and clears both athletes' ready, server side (review M3). The re-weigh field is shipped (board 21c)."],
           "TK-F7; shipped LBS, Re-weigh", [TAG_B, TAG_PENDING]),
    ]
    return row_board([TAG_B], KICK, f"Athlete face-off ({A}'s phone)",
                     "Step 1 is the shipped weigh-in (own weight only; the opponent check moves to step 2). Step 2 merges the opponent weight check into ready. Nobody auto-starts; the timekeeper starts the match. Stakes for M. Reyes vs D. Okafor everywhere on this page: WIN +14, DRAW -2, LOSS -18.".replace(" -2", " " + MINUS + "2").replace(" -18", " " + MINUS + "18"),
                     frames)


# ---------- Rules board (1440) ----------
def cell(k, t, c, b):
    sub = f'<span style="display: block; margin-top: 4px">{body(t, 11, INK2)}</span>' if t else ""
    return (f'<span style="display: inline-flex; height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 2px; border: 1px solid {b}; align-items: center; '
            f'font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 1.68px; color: {c}">{k}</span>{sub}')


def yes(t=""):
    return cell("YES", t, GREEN, GREEN_RULE)


def no(t=""):
    return cell("NO", t, NEG, RED_RULE)


def na(t=""):
    return cell("N/A", t, INK3, HL)


RULES = [
    ("Pick or replace a timekeeper", [na(), na(), na()],
     [yes("While no timekeeper has accepted, or after a drop-out. With Q12 the other athlete approves first."), yes("Same as the challenger."), no()],
     "request_match_timekeeper: caller is a competitor; status pending, or in_progress with timekeeper_id null; target is in get_timekeeper_candidates (not a competitor, not blocked, not busy per the new _timekeeper_busy). One pending request per match (cancel_timekeeper_request withdraws it). Business outcomes return {ok:false, code}.",
     ["timekeeper_is_competitor", "timekeeper_unavailable", "timekeeper_busy"]),
    ("Accept timekeeping", [na(), na(), na()],
     [no("Never the timekeeper (D2)."), no("Same."), yes("Only the asked person, within 2 minutes; or the in-person code/QR fallback.")],
     "respond_timekeeper_request(accept): caller is the request's invitee_id; request pending and before expires_at; not busy. Success runs _set_match_timekeeper (the same core as join_match_as_timekeeper: set timekeeper_id, consume any code, write the timekeeper recording intent) and clears the deadline.",
     ["not_requested", "request_closed", "timekeeper_busy"]),
    ("Weigh-in (own weight)", [yes(), yes(), na()], [yes(), yes(), no("Their weight never enters the match.")],
     "Unchanged (challenge weights; reweigh_for_match). In timekeeper mode a re-weigh voids EVERY check whose subject is the caller (the opponent's and the timekeeper's) and clears both athletes' ready (review M3); flag-OFF reweigh_for_match unchanged.", []),
    ("Opponent weight check", [yes("Checks the other athlete."), yes("Same."), na()], [yes("Unchanged, merged into ready."), yes("Same."), na("See next row.")],
     "check_opponent_weight unchanged.", []),
    ("Timekeeper weight check", [na(), na(), na()], [no(), no(), yes("Checks EACH athlete (D5).")],
     "New check_athlete_weight_as_timekeeper(p_match_id, p_subject_id, p_verdict, p_weight) writing the sibling table match_timekeeper_weight_checks (PK (match_id, subject_id)); caller is timekeeper_id; subject is a competitor; status pending. match_weight_checks and check_opponent_weight are untouched (review M4).",
     ["not_timekeeper"]),
    ("Ready", [yes("Broadcast only."), yes("Broadcast only."), na()], [yes("Server side."), yes("Server side."), no()],
     "mark_match_ready: refuses on a flag-OFF match; caller is a competitor; own weight in; own opponent check confirmed (mandatory in timekeeper mode regardless of opponent_weight_check_required, review m3); reset by any re-weigh or flag.",
     ["not_timekeeper_mode", "weight_check_pending"]),
    ("Start", [yes("Both phones auto-call start_match."), yes("Auto, same race."), na()], [no("No auto-start."), no("No auto-start."), yes("Start button.")],
     "start_match: caller is timekeeper_id; both athletes ready; both timekeeper confirmations, no open flag.",
     ["not_timekeeper", "timekeeper_required", "athletes_not_ready", "WEIGHT_* (as today)"]),
    ("Pause / resume", [yes(), yes(), na()], [no("Read-only clock."), no("Read-only clock."), yes()],
     "can_control_match: timekeeper only.", ["not_timekeeper"]),
    ("End", [yes("Broadcast (legacy end_match RPC exists, unused)."), yes("Same."), na()], [no(), no(), yes("end_match_clock; the server auto-ends at full time.")],
     "end_match_clock: refuses on flag-OFF; caller is timekeeper_id; in_progress. Legacy end_match refuses timekeeper-mode matches.",
     ["not_timekeeper_mode", "not_timekeeper", "match_not_live", "use_end_match_clock"]),
    ("Record result", [yes("Claim-first; recorder auto-confirmed."), yes("Same."), na()], [no("Waits; no take-over."), no("Waits; no take-over."), yes("Only recorder; nobody auto-confirmed.")],
     "record_match_result: caller is timekeeper_id; in_progress; no confirmation row written.",
     ["not_timekeeper"]),
    ("Confirm / dispute", [yes("24 h lock."), yes("24 h lock."), na()], [yes("Recorder no longer auto-confirmed."), yes("Same."), no("Never.")],
     "Unchanged; the timekeeper can never confirm or dispute.", ["not_participant"]),
    ("Cancel / leave before start", [yes("Cancels for both (cancel_session_match)."), yes("Same."), yes("Code-joined record-only timekeeper: Leave removes only them (leave_match_as_timekeeper).")], [yes("Cancels for all."), yes("Cancels for all."), yes("Leave removes only them.")],
     "leave_match_as_timekeeper (pending: drop-out rule).", []),
    ("Remove a seated timekeeper", [yes("Pending (remove_match_timekeeper)."), yes("Same."), na()],
     [yes("Only if the timekeeper has given no weight verdict yet; pushes the other athlete."), yes("Same."), na()],
     "remove_match_timekeeper in timekeeper mode: refused for one athlete alone unless the timekeeper has given no weight verdict yet, in which case it is allowed and pushes the other athlete (review B2). Flag-OFF unchanged (pgTAP 108).",
     ["requires_both_athletes"]),
    ("Get a timekeeper code", [yes("Pending."), yes("Pending."), na()], [yes("Pending."), yes("Pending."), na()],
     "get_match_timekeeper_code unchanged in behaviour; the code is the in-person fallback.", []),
    ("Join by code", [na(), na(), yes("Anyone not a competitor, pending.")], [na(), na(), yes("Same rules as an accepted request.")],
     "join_match_as_timekeeper in timekeeper mode: runs through _set_match_timekeeper with _timekeeper_busy, the deadline check, the opponent-approval rule (Q12) and a push to both athletes; refused after pending (review B2, m8).",
     ["timekeeper_busy", "match_started"]),
    ("Leave after start", [no("Not offered."), no("Not offered."), na()], [no("Not offered."), no("Not offered."), yes("Until ended_at: drop-out rule. After ended_at: no Leave.")],
     "leave_match_as_timekeeper extended to in_progress without ended_at, timekeeper mode only.", ["result_owed"]),
    ("Record video", [yes(), yes(), yes("Code-joined: record-only media rights.")], [yes(), yes(), yes("D8.")],
     "Unchanged (can_upload_match_video, record-only media rights); a dropped timekeeper keeps read access to their own footage via match_timekeeper_history.", []),
]


def hint_chip(h):
    return (f'<span style="display: inline-flex; height: 20px; box-sizing: border-box; padding: 0 6px; border-radius: 2px; background: {VOID}; border: 1px solid {HLS}; align-items: center; '
            f'font-family: {MONO}; font-weight: 500; font-size: 11px; color: {INK}; white-space: nowrap">{q(h)}</span>')


def rules_table():
    def th(t, extra=""):
        return f'<th scope="col" style="text-align: left; vertical-align: bottom; padding: 8px 10px; border-bottom: 1px solid {HLS}{extra}">{mono(t, 10, INK3, 700, 1.68, True, "white-space: normal")}</th>'

    def td(x, extra=""):
        return f'<td style="vertical-align: top; padding: 10px; border-bottom: 1px solid {HL}{extra}">{x}</td>'
    group = (f'<tr><th style="padding: 0"></th>'
             f'<th colspan="3" style="text-align: left; padding: 10px; background: {PANEL}; border-left: 1px solid {HL}">{mono("FLAG OFF (TODAY, requires_timekeeper = false)", 10, INK, 700, 1.68, False, "white-space: normal")}</th>'
             f'<th colspan="3" style="text-align: left; padding: 10px; background: rgba(245,158,11,0.08); border-left: 1px solid {AMBER_RULE}">{mono("TIMEKEEPER MODE (requires_timekeeper = true)", 10, AMBER, 700, 1.68, False, "white-space: normal")}</th>'
             f'<th style="text-align: left; padding: 10px; border-left: 1px solid {HL}">{mono("SERVER RULE AND REFUSAL HINT (TIMEKEEPER MODE)", 10, INK, 700, 1.68, False, "white-space: normal")}</th></tr>')
    heads = ("<tr>" + th("Action") + th("Challenger", f"; border-left: 1px solid {HL}") + th("Opponent") + th("Timekeeper")
             + th("Challenger", f"; border-left: 1px solid {AMBER_RULE}") + th("Opponent") + th("Timekeeper") + th("Rule", f"; border-left: 1px solid {HL}") + "</tr>")
    rows_ = ""
    for i, (act, off, on, rule, hints) in enumerate(RULES):
        bg = PLATE if i % 2 == 0 else "transparent"
        hh = f'<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px">{"".join(hint_chip(h) for h in hints)}</div>' if hints else ""
        rows_ += (f'<tr style="background: {bg}">' + td(heading(act, 13, INK))
                  + td(off[0], f"; border-left: 1px solid {HL}") + td(off[1]) + td(off[2])
                  + td(on[0], f"; border-left: 1px solid {AMBER_RULE}") + td(on[1]) + td(on[2])
                  + td(body(rule, 12, INK2) + hh, f"; border-left: 1px solid {HL}") + "</tr>")
    cols = '<colgroup><col style="width: 150px"><col style="width: 112px"><col style="width: 104px"><col style="width: 112px"><col style="width: 136px"><col style="width: 112px"><col style="width: 170px"><col></colgroup>'
    return f'<table style="width: 100%; border-collapse: collapse; table-layout: fixed">{cols}<thead>{group}{heads}</thead><tbody>{rows_}</tbody></table>'


def callout(title, inner, tone=INK, tag="", w=None):
    ww = f"width: {w}px; flex-shrink: 0; " if w else "flex: 1 1 0; min-width: 0; "
    return (f'<section style="{ww}box-sizing: border-box; background: {PLATE}; border: 1px solid {HL}; border-top: 3px solid {tone}; border-radius: 4px; padding: 18px; display: flex; flex-direction: column; gap: 10px">'
            f'{row(mono(title, 10, tone if tone != INK else INK3, 700, 2.52, True, "white-space: normal") + tag, 8, "center", "space-between")}{inner}</section>')


def bullets(items, size=12, color=INK2):
    return col("".join(row(f'<span style="width: 4px; height: 4px; margin-top: {round(size * 0.55)}px; background: {INK3}; flex-shrink: 0"></span>' + body(t, size, color), 10, "flex-start") for t in items), 7)


def timeline(steps):
    out = ""
    for i, (tl, tx, tone) in enumerate(steps):
        c = {"ink": INK, "amber": AMBER, "red": NEG, "green": GREEN}[tone]
        out += (f'<div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 6px">'
                f'<div style="display: flex; align-items: center"><span style="width: 10px; height: 10px; border-radius: 5px; background: {c}; flex-shrink: 0"></span>'
                f'<span style="flex: 1; height: 2px; background: {HLS if i < len(steps) - 1 else "transparent"}"></span></div>'
                f'{mono(tl, 11, c, 700, 0.56, False)}<span style="padding-right: 8px">{body(tx, 11, INK2)}</span></div>')
    return f'<div style="display: flex; flex-direction: row; margin-top: 8px">{out}</div>'


@board("P-TK-B-Rules.dc.html", "Proposed: Timekeeper mode rules (who can do what, flag OFF vs timekeeper mode, server rule and HINT)", w=1440)
def b_rules():
    status = row(corner_tag("TIMEKEEPER MODE (FLAG ON)", "amber") + corner_tag("Proposed, for owner review · 2026-10-15", "ink") + TAG_REVIEW
                 + mono("SPEC.md section R and B.6 (review round 1 fixes) · epics jr_be-uey, jits-o47s", 10, INK3, 500), 10, extra="flex-wrap: wrap")
    legend = row(cell("YES", "", GREEN, GREEN_RULE) + body("allowed", 12, INK2) + cell("NO", "", NEG, RED_RULE) + body("refused by the server (HINT in the last column)", 12, INK2)
                 + cell("N/A", "", INK3, HL) + body("the action does not exist for that role in that mode", 12, INK2), 8, extra="margin-top: 6px")
    top = (f'<div style="padding: 40px 48px 0; display: flex; flex-direction: column; gap: 10px">{status}{heading("Timekeeper mode: who can do what", 32, INK, tag="h1")}'
           f'<p style="margin: 0; max-width: 1100px">{body("Every refusal is a server rule; the client only mirrors it and never trusts the public session-match broadcast. Timekeeper-mode rules apply only when matches.requires_timekeeper = true; with it false every function takes today" + chr(39) + "s path byte for byte (pgTAP 061, 108, 111 unchanged).", 15, INK2)}</p>{legend}</div>')
    table = f'<div style="padding: 20px 48px 0">{rules_table()}</div>'

    ten = (bullets([
        "timekeeper_deadline_at = now + 10 min when a timekeeper-mode match is created, and again at each drop-out. Cleared when a timekeeper accepts (arrived = accepted).",
        "Every timekeeper RPC checks it lazily, but a lazy check never cancels then raises (the cancel would roll back): it returns {ok:false, code:'match_cancelled'} after committing, or leaves the cancel to the cron (review m4).",
        "A per-minute pg_cron sweep cancels any timekeeper-mode match past its deadline with no seated timekeeper (before the end), with TK-N4 or TK-N6. After ended_at it flags the match for admin review instead (B.6).",
        "Flag-OFF matches are never touched by the sweep (a stale pending flag-OFF match stays jr_be-xpf).",
    ]) + timeline([("0:00", "Accepted; match pending; deadline set", "ink"), ("0:40", f"Ask {TK} (2 min lapse)", "amber"), ("1:10", "Declined: pick again", "red"),
                   ("1:30", "Ask L. Tanaka", "amber"), ("3:30", "Lapsed: pick again", "red"), ("3:50", "Ask S. Whitfield", "amber"), ("4:20", "Accepted: deadline cleared", "green")]))
    snap = bullets([
        "requires_timekeeper (default false) is written ONCE at creation, true only when feature_flags.timekeeper_role is on AND both athletes' clients advertised p_client_supports_timekeeper (B.0).",
        "Capability rule (review M1): both creation paths take p_client_supports_timekeeper boolean DEFAULT false; each client advertises it on challenge create, accept and start (stored per side). An older build never receives a timekeeper-mode match; a missing field in an older payload reads as false.",
        "Guarded against client writes (guard_match_columns). Every rule keys off this column, never the live flag (D1): a flag flip never changes a match in flight.",
    ])
    lapse = bullets([
        "match_timekeeper_requests.expires_at = request time + 2 minutes; one pending request per match (Q7).",
        "Shorter than the 10-minute deadline so the athletes get several tries. On lapse: TK-P22 on both pickers.",
        "Ask someone else withdraws the open request at once (cancel_timekeeper_request).",
        "Phase 2 invite requests do not lapse at 2 minutes; they lapse with the deadline.",
    ])
    drop = bullets([
        "Explicit Leave = immediate drop-out. Offered before the start and during the clock, never after ended_at (the timekeeper owes the result; result_owed).",
        "Before the start: timekeeper_id cleared, both athletes' ready cleared (weigh-ins and athlete checks stay), the timekeeper's weight confirmations voided, fresh 10-minute deadline; athletes back on the picker with TK-D1.",
        "During the clock: a Leave pauses the clock at that moment; timekeeper_id cleared; fresh 10-minute deadline; TK-D2, TK-D3, TK-D4. A replacement (approved by the other athlete, Q12) resumes with TK-D5; weights not re-checked. No replacement in 10 minutes: server-only in_progress to cancelled, no rating, TK-D6 / TK-N6.",
        "A dropped timekeeper keeps read access to their own footage (match_timekeeper_history).",
    ])
    offline = bullets([
        "Heartbeat every 15 s to the server-only match_timekeeper_presence (never matches). A 60 s gap marks the timekeeper OFFLINE: athletes see TK-D7 with the deadline chip and the 10-minute wait starts.",
        "Nothing else changes while offline: the seat, the clock and any queued result stay valid; no backdated pause. Back within 10 minutes: the banner clears and the wait stops (Q3b).",
        "Only when the 10 minutes elapse does an offline timekeeper become a drop-out; the clock then pauses if still running.",
        "Stall (Q3c, PM proposal pending the owner): a seated, online timekeeper who has not started within 10 minutes of both athletes being ready, or not recorded within 10 minutes of ended_at, is treated as offline.",
        "After ended_at an offline or stalled timekeeper never cancels the match: it is flagged for admin review (match_timekeeper_review), athletes see TK-D8, an admin records or voids it. The server auto-ends the clock at full time.",
    ])
    lock = bullets([
        "Every new writer (the sweeps, end_match_clock, mark_match_ready, the request RPCs, the timekeeper weight check) locks matches FOR UPDATE first and the request or check row second.",
        "Under the lock it re-checks status and requires_timekeeper.",
        "It never takes the rating_v9 advisory lock after a match row lock; record_match_result takes the rating lock first, then the match row.",
        "A cancel racing a record is then safe: whichever commits first wins.",
    ])
    branches = bullets([
        "Code/QR join (join_match_as_timekeeper) in timekeeper mode: same rules as an accepted request (_set_match_timekeeper, _timekeeper_busy, the deadline, the Q12 approval), pushes both athletes, refused after pending (match_started).",
        "remove_match_timekeeper in timekeeper mode: one athlete alone is refused (requires_both_athletes) once the timekeeper has given any weight verdict; before that it is allowed and pushes the other athlete.",
        "get_match_timekeeper_code unchanged. Flag-OFF branches unchanged (pgTAP 108).",
    ])
    pend = bullets([
        "Q1: a timekeeper Doesn't look right blocks the start until that athlete re-weighs and the timekeeper confirms again, as today's athlete flag (recommended yes). Drawn on P-TK-B5 frame 5 and P-TK-B6.",
        "Q12: the other athlete approves the pick with one tap (TK-P25 to TK-P27; the picker waits with TK-P28) inside the same 10 minutes, before the request is sent; also for mid-match replacements and code joins (recommended yes; requested_by and approved_by recorded). Drawn on P-TK-B2 frames 5 and 6.",
        "Q3b offline and Q3c stall rules (recommended yes).",
    ])
    grid = (f'<div style="padding: 24px 48px 48px; display: flex; flex-direction: column; gap: 20px">'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{callout("The 10-minute rule (D9)", ten, AMBER)}{callout("The snapshot and client-capability rule (D1, review M1)", snap, INK, w=440)}</div>'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{callout("The drop-out rule: explicit Leave (B.6)", drop, NEG)}{callout("The offline and stall rules (B.6, Q3b, Q3c)", offline, NEG)}</div>'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{callout("Lock order (review m5)", lock, INK)}{callout("Code join and removal in timekeeper mode (review B2)", branches, INK)}{callout("The 2-minute request lapse", lapse, AMBER, w=380)}</div>'
            f'{callout("Pending owner", pend, NEG, TAG_PENDING)}</div>')
    return top + table + grid


# ---------- Map (1440) ----------
def map_card(title, inner, w=None, tone=None, tag=""):
    ww = f"width: {w}px; flex-shrink: 0; " if w else "flex: 1 1 0; "
    bt = f"border-top: 3px solid {tone}; " if tone else ""
    return (f'<section style="{ww}min-width: 0; box-sizing: border-box; background: {PLATE}; border: 1px solid {HL}; {bt}border-radius: 4px; padding: 18px; display: flex; flex-direction: column; gap: 10px">'
            f'{row(mono(title, 10, INK3, 700, 2.52, True, "white-space: normal") + tag, 8, "center", "space-between")}{inner}</section>')


def kv(rows_, kw=150, size=12):
    return "".join(f'<div style="display: flex; flex-direction: row; gap: 12px; padding: 7px 0; border-top: 1px solid {HLF}">'
                   f'<div style="width: {kw}px; flex-shrink: 0">{k}</div><div style="flex: 1; min-width: 0">{body(v, size, INK2)}</div></div>' for k, v in rows_)


def flow():
    """Three-role swimlane, accept to final, as static boxes."""
    stages = ["Accept", "Pick", "Ask / answer", "Weigh-in", "Ready", "Start", "Live", "End clock", "Result", "Confirm"]
    lanes = [
        ("Challenger", A, ["Sent; drops in on accept", "Picker (crew); can Ask", "Sees the pending card", "Own weight", "Checks opponent + ready, one tap", "Waits", "Clock read-only; records video", "Sees the timekeeper ended it", "Waits, no take-over", "Confirm or dispute"]),
        ("Opponent", B, ["Accepts (TK-AR1)", "Picker (crew); can Ask", "Approves the pick (Q12), then sees the pending card", "Own weight", "Checks opponent + ready, one tap", "Waits", "Clock read-only; records video", "Sees the timekeeper ended it", "Waits, no take-over", "Confirm or dispute"]),
        ("Timekeeper", TK, ["", "", "Push, sheet: Accept", "Confirms EACH weight", "Watches ready", "Start match", "Pause, resume; may record", "end_match_clock, or server at duration", "Records result within 10 min", "Done (cannot confirm)"]),
    ]
    hot = {"Start match", "Pause, resume; may record", "end_match_clock, or server at duration", "Records result within 10 min"}
    g = (f'<div style="display: grid; grid-template-columns: 130px repeat(10, 1fr); gap: 6px"><div></div>'
         + "".join(f'<div style="padding: 4px 2px">{mono(f"{i + 1} · {s}", 10, INK, 700, 1.12, True, "white-space: normal")}</div>' for i, s in enumerate(stages)))
    for lane, who, cells in lanes:
        tone = AMBER if lane == "Timekeeper" else INK3
        g += f'<div style="padding: 8px; border-left: 3px solid {tone}; background: {PANEL}; display: flex; flex-direction: column; gap: 3px">{heading(lane, 13, INK)}{mono(who, 10, INK3, 500, 0.56, False)}</div>'
        for c in cells:
            if c:
                h = lane == "Timekeeper" and c in hot
                g += f'<div style="padding: 8px; background: {VOID}; border: 1px solid {AMBER if h else HL}; border-radius: 3px">{body(c, 11, INK if h else INK2)}</div>'
            else:
                g += f'<div style="border: 1px dashed {HLF}; border-radius: 3px"></div>'
    g += "</div>"
    br = [("At 3 · declined or 2-min lapse", "Back to 2 · Pick (TK-P21 / TK-P22). The deadline keeps running.", AMBER),
          ("At 2-3 · 10 min, nobody accepted", "Server cancels: cancelled, no rating. Toast TK-W2, push TK-N4.", NEG),
          ("At 4-5 · timekeeper Leaves", "Ready and the timekeeper's confirmations cleared; back to 2 with TK-D1; fresh 10 min.", AMBER),
          ("At 6-7 · Leave", "Clock paused; Pick a new timekeeper (TK-D4), approved by the other athlete; cancel only if nobody takes over in 10 min (TK-N6).", NEG),
          ("At 4-9 · OFFLINE (60 s gap)", "TK-D7 and the 10-min wait; no pause; back in time = carry on; else a drop-out (or admin review after the end).", AMBER),
          ("At 8-9 · no result in 10 min", "No Leave after the clock ends. A stall goes to admin review (TK-D8): flagged, not cancelled.", NEG),
          ("Final", "No confirmed status exists: final = completed and every competitor confirmed (or disputed), or the 24 h cron.", INK3)]
    branches = (f'<div style="display: flex; flex-direction: row; gap: 10px; margin-top: 4px">'
                + "".join(f'<div style="flex: 1; padding: 10px; border: 1px dashed {c}; border-radius: 3px; display: flex; flex-direction: column; gap: 4px">{mono(t, 10, c, 700, 1.12, True, "white-space: normal")}{body(d, 11, INK2)}</div>' for t, d, c in br)
                + '</div>')
    return g + branches


@board("P-TK-00-Map.dc.html", "Proposed: Timekeeper mode map (what changed, decisions, flow, asks, open questions, go/no-go)", w=1440)
def b00():
    status = row(corner_tag("Proposed, for owner review · 2026-10-15", "amber") + corner_tag("Recommendation: ship dark", "red") + TAG_REVIEW
                 + mono("Spec SPEC.md · Copy COPY-DECK.md · Epics jr_be-uey (backend), jits-o47s (mobile) · Flag timekeeper_role", 10, INK3, 500), 10, extra="flex-wrap: wrap")
    top = (f'<div style="padding: 40px 48px 0; display: flex; flex-direction: column; gap: 10px">{status}{heading("Timekeeper mode: map", 32, INK, tag="h1")}'
           f'<p style="margin: 0; max-width: 1100px">{body("Timekeeper mode puts a third, neutral, signed-in person in charge of a ranked match: they start it, run the clock and record the result, while every athlete safeguard stays (opponent weight check, confirm or dispute, the 24 h auto-confirm, video from any phone). It sits behind the flag timekeeper_role, snapshotted per match, and the flag-OFF flow does not change.", 15, INK2)}</p></div>')
    changed = bullets([
        "Flag ON only: every NEW match whose two athletes' clients advertise timekeeper support requires a timekeeper (matches.requires_timekeeper, snapshot at creation). Otherwise today's two-athlete flow, untouched.",
        "After Accept both athletes land on a new step crew: pick a timekeeper from friends of either athlete and live athletes nearby (Q12: the other athlete approves), and the asked person accepts on their phone. The code/QR join stays as the in-person fallback under the same rules.",
        "A 10-minute deadline from accept; nobody accepted means the server cancels the match, no rating.",
        "Athlete face-off: weigh-in unchanged; ready merges the opponent weight check (Weight looks right, I'm ready), stored server side.",
        "The timekeeper confirms each athlete's weight and alone can Start, pause, resume, end the clock (new end_match_clock; the server also ends it at match duration) and record the result.",
        "Athletes keep their camera, see a read-only clock, then confirm or dispute; the recorder is no longer auto-confirmed.",
        "An explicit Leave pauses the clock; an OFFLINE timekeeper (60 s heartbeat gap) starts a 10-minute wait without pausing; cancel only if nobody takes over. After the clock ends there is no Leave; a result stall goes to admin review.",
        "Arena copy changes in two lines when the flag is known ON (TK-AR1, TK-AR2).",
    ], 13)
    dec = [("D1", "Flag timekeeper_role switches timekeeper mode; snapshot per match; flag OFF works exactly as now."),
           ("D2", "The timekeeper is an on-platform signed-in user, never a competitor; their weight is irrelevant (pseudo referee)."),
           ("D3", "Picked from friends and nearby athletes, after accept. Off-platform invites are not in phase 1 but are near term: the picker reserves the Invite someone not on ELO RATED slot (PHASE 2), reusing 016 invites."),
           ("D4", "The timekeeper alone starts, runs the clock (pause, resume, end) and records the result. Reverses the 2026-10-04 record-only decision for timekeeper-mode matches only."),
           ("D5", "The timekeeper confirms EACH athlete's weight, in addition to the athletes' opponent check."),
           ("D6", "Athletes still confirm the opponent's weight and mark ready (merged, recommended); the timekeeper drives once both are ready."),
           ("D7", "Athletes still confirm or dispute (24 h auto-confirm unchanged)."),
           ("D8", "All athletes can still record video; the timekeeper can too."),
           ("D9", "Timekeeper missing or dropped out: the match waits; after 10 minutes it is cancelled."),
           ("D10", "Alpha 2026-10-17: ON only if certain, else ship dark with the alpha flag OFF; nothing may block flag OFF."),
           ("D11", "Flag-OFF changes may be shown only as optional and separate (board P-TK-C1).")]
    decisions = kv([(mono(k, 11, INK, 700, 0.56, False), v) for k, v in dec], 44) + (
        f'<div style="margin-top: 6px; padding: 10px; border: 1px dashed {RED_RULE}; border-radius: 3px; display: flex; flex-direction: column; gap: 6px">{TAG_PENDING}'
        f'{body("Coordinator assumption: a timekeeper Doesn" + chr(39) + "t look right blocks the start until that athlete re-weighs and the timekeeper confirms again, as today" + chr(39) + "s athlete flag (Q1).", 12, INK2)}'
        f'{body("Also owner-pending: Q3b (offline), Q3c (stalls), Q4 (code/QR link in the picker), Q6 (cancelled-match video), Q8 and Q11 (phase 2), Q12 (opponent approves the timekeeper), Q13 (Arena copy with an older app on the other side).", 12, INK2)}</div>')
    be = kv([(mono(k, 11, INK, 700, 0.56, False), v) for k, v in [
        ("BE-1", "requires_timekeeper, timekeeper_deadline_at, ended_at; snapshot with p_client_supports_timekeeper DEFAULT false and the both-clients rule; guard; timekeeper_busy at creation."),
        ("BE-2", "_set_match_timekeeper core; match_timekeeper_requests (requested_by, approved_by, channel, invite_id); request / approve (Q12) / respond / cancel; get_timekeeper_candidates; new _timekeeper_busy; timekeeper-mode branches of join_match_as_timekeeper and remove_match_timekeeper."),
        ("BE-3", "mark_match_ready (refuses not_timekeeper_mode on flag-OFF; opponent check mandatory); timekeeper-mode re-weigh voids every check on the caller and clears both readies."),
        ("BE-4", "start_match timekeeper branch and HINTs."),
        ("BE-5", "can_control_match branch; new end_match_clock(p_match_id, p_final_elapsed_s); legacy end_match refuses timekeeper mode (use_end_match_clock)."),
        ("BE-6", "record_match_result timekeeper branch, no confirmation insert."),
        ("BE-7", "Sibling table match_timekeeper_weight_checks and check_athlete_weight_as_timekeeper; check_opponent_weight untouched."),
        ("BE-8", "match_timekeeper_presence heartbeat; sweeps for deadline, offline, auto-end at full time, start and result stalls; server-only in_progress to cancelled; admin-review flag after ended_at; match_timekeeper_history; lock order."),
        ("BE-9", "Pushes timekeeper_requested / accepted / declined / expired (category matches), TK-N5 to TK-N7; non-tab-root deep links."),
        ("BE-10", "get_match_details already admits the timekeeper: add requires_timekeeper, role, timekeeper name, presence and deadlines."),
        ("BE-11", "pgTAP per rules row; flag-OFF regression; legacy end_match refusal; stall; cancelled match leaves no rating rows; capability rule."),
        ("BE-P2", "PHASE 2 off-platform invite (later).")]], 50)
    fe = kv([(mono(k, 11, INK, 700, 0.56, False), v) for k, v in [
        ("FE-1", "use-timekeeper-enabled (fail-closed, known, refetch on foreground) for the Arena copy only."),
        ("FE-2", "Step crew and role routing (requires_timekeeper, missing = false); the wizard admits the timekeeper; pass p_client_supports_timekeeper on every challenge create, accept and start."),
        ("FE-3", "Picker, request card, asked-person sheet on /match/[id]/timekeep, push handler, deadline chip."),
        ("FE-4", "Athlete merged ready and timekeeper row; no auto-start."),
        ("FE-5", "Timekeeper face-off with Start."),
        ("FE-6", "Live: controls for the timekeeper only; athlete strip; end via end_match_clock."),
        ("FE-7", "Result: timekeeper form without claim; athletes wait; Done screen."),
        ("FE-8", "Drop-out plate, offline banner (TK-D7), admin-review state (TK-D8), re-pick sheet with approval (Q12), deadline chip, heartbeat."),
        ("FE-9", "Arena copy TK-AR1, TK-AR2."),
        ("FE-10", "match-loop harness: three-device scenario; flag-OFF scenario unchanged."),
        ("FE-P2", "PHASE 2 invite row and claim (later).")]], 50)
    risks = bullets([
        "Public broadcast channel (session-match:<id>, jr_be-czt): server gates never trust broadcasts; ready, end and drop-out move to the server in timekeeper mode.",
        "Stale pending matches: the 10-minute cancel covers timekeeper mode only; flag-OFF stale pending stays jr_be-xpf.",
        "pgTAP 061, 108 and 111 pin record-only behaviour: every change keys on requires_timekeeper so they pass unchanged.",
        "The wizard assumes two participants: the timekeeper must never become a match_participants row (loser derivation, finalize count).",
        "Older app builds: the capability rule keeps a mixed pair on the flag-OFF flow.",
        "A friendly timekeeper seated by one athlete (Q12, plus admin signals for repeat pairs, drop-outs after the end and disputes per timekeeper).",
        "Lock order: new writers lock matches first; the rating_v9 advisory lock is never taken after a match row lock.",
    ])
    qs = [("Q1", "Timekeeper flag blocks start until re-weigh and re-confirm?", "Yes, same as the athlete flag. PENDING OWNER."),
          ("Q2", "Merge the opponent check into ready?", "Yes in timekeeper mode; flag OFF (C1) not before the alpha."),
          ("Q3", "Explicit Leave during the clock: pause, wait 10 min for a replacement, then cancel, no rating?", "Yes. Rejected: hand the clock back to the athletes."),
          ("Q3b", "Offline timekeeper: a heartbeat gap starts the 10-min wait without unseating or pausing; a drop-out only when it expires?", "Yes."),
          ("Q3c", "Stalls: no start within 10 min of both ready, or no result within 10 min of the end, counts as offline; after the end, admin review, no Leave?", "Yes."),
          ("Q4", "Code/QR as the in-person fallback?", "Keep on the backend; add Use a code instead (TK-P24) only after the picker ships. Not drawn."),
          ("Q5", "Who can pick?", "Either athlete asks, either can Ask someone else; see Q12."),
          ("Q6", "Video of a cancelled match?", "Keep it attached, visible to the athletes and the timekeeper who filmed it, no highlight."),
          ("Q7", "Request lapse?", "2 minutes inside the 10-minute deadline."),
          ("Q8", "Phase 2 deadline?", "A claimed off-platform invite extends the deadline once by 10 minutes."),
          ("Q9", "Timekeeper rating or credit?", "None in phase 1; a matches-timekept count later."),
          ("Q10", "Alpha?", "Ship dark (go/no-go below)."),
          ("Q11", "Phase 2 invite side effects?", "Create the friendship; do not count against the challenge invite cap."),
          ("Q12", "Should the other athlete approve a picked timekeeper (collusion)?", "Yes: one tap (TK-P25 to TK-P27, picker waits with TK-P28) inside the same 10 minutes, before the request is sent; also for replacements and code joins; admin signals."),
          ("Q13", "Arena copy says a timekeeper is needed even if the other athlete's app is too old to support it; keep the copy?", "Yes: nothing breaks, the match falls back to the two-athlete flow.")]
    openq = "".join(f'<div style="display: flex; flex-direction: row; gap: 12px; padding: 7px 0; border-top: 1px solid {HLF}">'
                    f'<div style="width: 36px; flex-shrink: 0">{mono(k, 11, NEG if k in ("Q3b", "Q3c", "Q12", "Q13") else INK, 700, 0.56, False)}</div>'
                    f'<div style="flex: 1; min-width: 0">{body(qq, 12, INK)}</div><div style="width: 330px; flex-shrink: 0">{body("Recommended: " + a, 12, INK2)}</div></div>' for k, qq, a in qs)
    gonogo = (bullets([
        "1 · Every rules row enforced server side and covered by pgTAP; the full jr_be suite green with 061, 108, 111 unchanged.",
        "2 · Flag-OFF regression: the match-loop two-device scenario passes unchanged with all timekeeper code merged.",
        "3 · A three-device run on TestFlight or OTA: decline, lapse, pre-start drop-out, mid-match drop-out with replacement, 10-minute cancel, timekeeper weight flag.",
        "4 · Migrations applied to prod by hand with a clean dry run; a flip-on and flip-back of timekeeper_role rehearsed on staging with a match in flight (part of BE-11 testing).",
        "5 · Independent review of backend and mobile diffs closed with no open findings.",
        "6 · Client capability gate in: an older build never receives a timekeeper-mode match.",
        "7 · pgTAP proves the legacy end_match refuses timekeeper-mode matches and covers a stalling timekeeper.",
    ]) + kv([(mono("Backend", 11, INK, 700, 0.56, False), "BE-1 to BE-11: about 5 to 7 engineer days with pgTAP."),
             (mono("Mobile", 11, INK, 700, 0.56, False), "FE-1 to FE-10: about 4 to 5 days."),
             (mono("Review + test", 11, INK, 700, 0.56, False), "1 to 2 days."),
             (mono("Total", 11, NEG, 700, 0.56, False), "Roughly 10 to 14 days against 2 before the alpha.")], 110)
        + f'<div style="margin-top: 6px; padding: 14px; border: 1px solid {RED}; border-radius: 3px; display: flex; flex-direction: column; gap: 6px">'
          f'{mono("RECOMMENDATION: SHIP DARK", 13, NEG, 700, 1.68)}{body("The alpha (2026-10-17) runs with timekeeper_role OFF, which this proposal guarantees is untouched. Build timekeeper mode behind the flag after owner approval, enable it for an internal three-person test, then for alpha users.", 13, INK)}</div>')
    phase2 = (f'<div style="display: flex; flex-direction: column; gap: 8px">{row(TAG_P2 + mono("Not in the first build", 10, INK3, 700, 1.68), 8)}'
              + bullets([
                  "The picker row Invite someone not on ELO RATED calls create_timekeeper_invite(p_match_id): a 016 invites row with kind timekeeper and match_id, its link expiring at the match deadline; share sheet (TK-X1).",
                  "The request row gets channel invite and invite_id; the athletes see Waiting for them to join. (TK-X2).",
                  "Invitee: install, sign up, age and terms gates, claim_timekeeper_invite (attribution, first write wins), then the same Accept sheet and _set_match_timekeeper.",
                  "Sign-up takes 3 to 6 minutes: a claimed invite extends the deadline once by 10 minutes (Q8). Rework avoided now: channel, invite_id and the reserved row exist in phase 1.",
              ]) + f'<a href="{href("P-TK-B11-Phase2-Invite")}" style="color: {NEG}">{mono("BOARD P-TK-B11", 10, NEG, 700, 1.68)}</a></div>')

    def links(items, head):
        return (mono(head, 10, INK3, 700, 1.68, True, "margin-top: 4px; white-space: normal") + "".join(
            f'<a href="{href(bid)}" style="display: flex; flex-direction: row; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid {HLF}; color: {INK}">'
            f'<span style="width: 44px; flex-shrink: 0">{mono(n, 11, INK, 700, 0.56, False)}</span>{body(t, 12, INK)}<span style="flex: 1"></span>{mono(bid, 9, INK3, 400, 0, False)}{ic("chev_r", 14, INK3)}</a>'
            for bid, n, t in items))
    boards_ = (links(BA, "Row A · CURRENT (FLAG OFF), mirrors shipped code") + links(BB[:1], "Rules")
               + links(BB[1:12], "Row B · TIMEKEEPER MODE (FLAG ON)") + links(BB[12:], "OPTIONAL · FLAG OFF, not before the alpha"))
    grid = (f'<div style="padding: 24px 48px 48px; display: flex; flex-direction: column; gap: 20px">'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("What changed (timekeeper mode only)", changed)}{map_card("Owner decisions 2026-10-15 (binding)", decisions, 640)}</div>'
            f'{map_card("Flow across the three roles, accept to final (timekeeper mode)", flow(), tone=AMBER)}'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("Backend asks · beads epic jr_be-uey", be)}{map_card("Mobile asks · beads epic jits-o47s", fe)}{map_card("Risks", risks, 360)}</div>'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("Open questions for the owner, with recommended answers", openq)}{map_card("Boards on this page", boards_, 600)}</div>'
            f'<div style="display: flex; flex-direction: row; gap: 20px; align-items: stretch">{map_card("Alpha go/no-go (2026-10-17): all must hold to turn the flag ON", gonogo, tone=RED)}{map_card("PHASE 2: off-platform timekeeper (section P)", phase2, 520)}</div></div>')
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


def measure(path):
    """Natural height with headless Chrome (the measure.sh approach of the Oct 6 page)."""
    s = open(path).read()
    s = s.replace('<script src="./support.js"></script>', '')
    s = re.sub(r'(<div style="width: \d+px; )height: \d+px;', r'\1height: auto;', s, count=1)
    s = s.replace('</body>', '<script>window.addEventListener("load",()=>setTimeout(()=>{document.body.setAttribute("data-h",document.querySelector("x-dc > div").scrollHeight)},300))</script></body>')
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "m.html")
        open(p, "w").write(s)
        out = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--virtual-time-budget=6000", "--dump-dom", "file://" + p],
                             capture_output=True, text=True, timeout=120).stdout
    m = re.search(r'data-h="(\d+)"', out)
    return int(m.group(1)) if m else None


def main():
    do_measure = "--no-measure" not in sys.argv
    written = []
    for file, title, w, fn in BOARDS:
        res = fn()
        if isinstance(res, tuple):
            w, inner = res
        else:
            inner = res
        assert not any(d in inner for d in BAD_DASHES), f"dash in {file}"
        path = os.path.join(OUT, file)
        t = title.replace("Proposed: ", "")
        h = 6000
        open(path, "w").write(page(t, w, h, inner))
        if do_measure:
            mh = measure(path)
            if mh:
                h = mh
                open(path, "w").write(page(t, w, h, inner))
        written.append({"id": file[:-len(".dc.html")], "file": file, "title": title, "w": w, "h": h})
        print(f"{file} {w}x{h}")
    json.dump(written, open(os.path.join(HERE, "boards_b1.json"), "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
