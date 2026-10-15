"""Designer A: the CURRENT two-athlete Arena match flow (timekeeper_role OFF, today), page
"Proposed (Oct 15 Timekeeper)". Boards P-TK-A1..A5.

Static markup only: this script writes .dc.html files; nothing in the boards is script-built.

Usage:
  CANVAS_SRC=<folder holding project/<board>.dc.html copies of the live "Current app" boards> python3 gen_a.py
  python3 gen_a.py --measure     # also measures each board in headless Chrome and writes the heights

Sources of truth:
  Code:   jits_web origin/development 4a20ee80 (2026-10-15). Every string on a frame is literal copy
          from apps/mobile; each frame carries a "source: file:line" caption.
  Frames: the phone frames reuse the live "Current app" boards (canvas version 1792079812-15a6,
          read 2026-10-15) verbatim, because those boards were drawn from this code and reviewed;
          the canvas was last synced at 8dc39ed8 and the only match-flow commits since then
          (jits-rog5.11, AI consent gate) change no visible copy on these screens. Frames marked
          DERIVED are built here from a live board plus the code lines cited under them (states
          the canvas does not draw yet). The generator asserts every edit it makes, so a changed
          source board fails loudly.
  Tokens: apps/mobile/lib/tokens.ts (dark) and onMediaTokens. NativeWind rem = 14 px.
No em dashes anywhere.
"""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "project")
SRC = os.environ.get(
    "CANVAS_SRC",
    "/private/tmp/claude-501/-Users-msponagle-code-EloRated-jr-be/852c74d5-3322-470d-96b2-12f8e80aa19f/scratchpad/artifact-files/b49b08c7-1cf8-4158-ba3d-b585ab3b7c94",
)
os.makedirs(OUT, exist_ok=True)
CODE_REF = "jits_web origin/development 4a20ee80"
BANNED = (chr(0x2014), chr(0x2013), chr(0x2015))

# ---- tokens (dark), apps/mobile/lib/tokens.ts ----
VOID, PANEL, PLATE, BRIGHT = "#0D0F14", "#13151B", "#1E222B", "#262A34"
INK, INK2, INK3 = "#E8EDF2", "#9CA3AF", "#8D929D"
RED, NEG, AMBER, GREEN = "#E63946", "#EC6A74", "#F59E0B", "#22C55E"
HL, HLF, HLS = "rgba(107,114,128,0.45)", "rgba(107,114,128,0.20)", "rgba(107,114,128,0.62)"
AMBER_RULE = "rgba(245,158,11,0.7)"
# onMediaTokens
OM_INK, OM_INK3, OM_CHIP, OM_CHIP_B = "#0D0F14", "#575C68", "rgba(232,235,240,0.96)", "rgba(13,15,20,0.34)"
OM_AMBER_SOFT, OM_DIM = "rgba(245,158,11,0.16)", "rgba(232,237,242,0.62)"
MONO, DM, INTER, BEBAS = "'JetBrains Mono', monospace", "'DM Sans', sans-serif", "'Inter', sans-serif", "'Bebas Neue', sans-serif"
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'

PAD, GAP = 48, 40
PHONE_W = 390

# lucide geometry (24 grid, stroke 2)
SVG_PENCIL = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
              '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>')
SVG_PLAY = ('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path></svg>')
SVG_CHECK_CIRCLE = ('<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#E8EDF2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                    '<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>')


def q(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace("'", "&#39;")


def mono(t, size=10, color=INK3, w=500, ls=1.68, caps=True, extra=""):
    tt = "text-transform: uppercase; " if caps else ""
    return (f'<span style="font-family: {MONO}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.3)}px; letter-spacing: {ls}px; '
            f'font-variant-numeric: tabular-nums; {tt}color: {color}{"; " + extra if extra else ""}">{q(t)}</span>')


def body(t, size=13, color=INK2, w=400, extra=""):
    return f'<span style="font-family: {INTER}; font-weight: {w}; font-size: {size}px; line-height: {round(size * 1.4)}px; color: {color}{"; " + extra if extra else ""}">{q(t)}</span>'


def heading(t, size=16, color=INK, tag="span", extra=""):
    return f'<{tag} style="margin: 0; font-family: {DM}; font-weight: 700; font-size: {size}px; line-height: {round(size * 1.25)}px; color: {color}{"; " + extra if extra else ""}">{q(t)}</{tag}>'


def chip(t, color=AMBER, border=AMBER_RULE):
    return (f'<span style="height: 20px; box-sizing: border-box; padding: 0 7px; border-radius: 2px; display: inline-flex; align-items: center; '
            f'background: rgba(0,0,0,0.88); border: 1px solid {border}; font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 13px; '
            f'letter-spacing: 1.68px; text-transform: uppercase; color: {color}; white-space: nowrap">{q(t)}</span>')


# ---------------------------------------------------------------- source boards
def load(name):
    path = os.path.join(SRC, "project", name)
    s = open(path).read()
    inner = s.split("<x-dc>", 1)[1].split("</x-dc>", 1)[0]
    inner = re.sub(r"<helmet>.*?</helmet>", "", inner, flags=re.S).strip()
    m = re.match(r'<div style="width: 390px; height: (\d+)px;', inner)
    assert m, f"{name}: root is not a 390 px board"
    return resample(name, inner), int(m.group(1))


# ---- sample data (BOARDS.md): M. Reyes challenger 1512 / 172.5 LBS, D. Okafor opponent 1487 / 171.4 LBS ----
# The live boards were drawn with Reyes 1487 / 170 and Okafor 1512 / 168. Swaps go through placeholders so
# the two values never collide. Stakes for Reyes (+14 / -2 / -18) follow B5; Okafor's (+18 / +1 / -13) follow B1.
MINUS = chr(0x2212)
REYES_STAKES = [("▲ +17", "▲ +14"), (f"▼ {MINUS}7", f"▼ {MINUS}2"), (f"▼ {MINUS}15", f"▼ {MINUS}18"),
                ('aria-label="WIN +17"', 'aria-label="WIN +14"'), ('aria-label="DRAW -7"', 'aria-label="DRAW -2"'),
                ('aria-label="LOSS -15"', 'aria-label="LOSS -18"')]
COMMON = [
    ("1487 · 170 LBS", "@R_PLATE@"), ("1512 · 168 LBS", "@O_PLATE@"), ("1487 · 1512", "@RO@"),
    ("ELO 1487<", "@R_ELO@"), ("ELO 1512<", "@O_ELO@"),
    (">170 LBS<", ">172.5 LBS<"), (">168 LBS<", ">171.4 LBS<"), ('value="170"', 'value="172.5"'),
    ("AT 168 LBS", "AT 171.4 LBS"), ("2 LBS APART", "1.1 LBS APART"),
    ("1487 → 1504", "1512 → 1526"), ("#12 → #11 · PASSED D. OKAFOR", "#12 → #11"),
    ("@R_PLATE@", "1512 · 172.5 LBS"), ("@O_PLATE@", "1487 · 171.4 LBS"), ("@RO@", "1512 · 1487"),
    ("@R_ELO@", "ELO 1512<"), ("@O_ELO@", "ELO 1487<"),
] + REYES_STAKES
# 14: Reyes's own Arena (challenger). Deltas are recomputed against 1512; Priya Shah stays 1395 so Leo Tanaka
# remains the closest unchallenged match; Leo's stakes are illustrative sample values.
ARENA_14 = [
    ('aria-label="Your rating 1487"', 'aria-label="Your rating 1512"'), (">1487<", ">1512<"), (">You 1487<", ">You 1512<"),
    ("1440 · −47 vs you · 175 lbs", "1440 · −72 vs you · 175 lbs"), ("Win +14 · Loss −18", "Win +11 · Loss −21"),
    ("Dana Okafor, ELO 1512, plus 25 vs you, 168 pounds", "Dana Okafor, ELO 1487, minus 25 vs you, 171.4 pounds"),
    (">1512 · <", ">1487 · <"), (">+25<", ">−25<"), (" · 168 lbs<", " · 171.4 lbs<"),
    ("ELO 1440, minus 47", "ELO 1440, minus 72"), (">−47<", ">−72<"),
    ("ELO 1395, minus 92", "ELO 1395, minus 117"), (">−92<", ">−117<"),
    ("ELO 1620, plus 133", "ELO 1620, plus 108"), (">+133<", ">+108<"),
    ("ELO 1301, minus 186", "ELO 1301, minus 211"), (">−186<", ">−211<"),
]
# 15: D. Okafor's phone (rating 1487) receiving M. Reyes's challenge.
SHEET_15 = [
    ("Watch your highlight vs Dana Okafor, unwatched", "Watch your highlight vs Marcus Reyes, unwatched"),
    (">vs Dana Okafor<", ">vs Marcus Reyes<"),
    (">DO<", ">MR<"), (">D. Okafor<", ">M. Reyes<"), (">ELO 1512 · 168 LBS<", ">ELO 1512 · 172.5 LBS<"),
    (">D. Okafor is live in the Arena<", ">M. Reyes is live in the Arena<"),
    ("▲ +17", "▲ +18"), (f"▼ {MINUS}7", "▲ +1"), (f"▼ {MINUS}15", f"▼ {MINUS}13"),
    ('aria-label="WIN +17"', 'aria-label="WIN +18"'), ('aria-label="DRAW -7"', 'aria-label="DRAW +1"'),
    ('aria-label="LOSS -15"', 'aria-label="LOSS -13"'),
]


def resample(name, s):
    table = ARENA_14 if name.startswith("14-") else SHEET_15 if name.startswith("15-") else COMMON
    for old, new in table:
        if old.startswith("@") or old in s:
            s = s.replace(old, new)
        elif name.startswith(("14-", "15-")):
            raise AssertionError(f"{name}: sample string not found: {old!r}")
    for stale in ("1487 · 170", "1512 · 168", ">170 LBS<", ">168 LBS<", "2 LBS APART", "1504", "+17"):
        assert stale not in s, f"{name}: stale sample value {stale!r} left"
    return s


def sub1(s, old, new, name=""):
    n = s.count(old)
    assert n == 1, f"{name}: expected 1 match, found {n}: {old[:80]!r}"
    return s.replace(old, new)


def one(pattern, s, name=""):
    ms = list(re.finditer(pattern, s, flags=re.S))
    assert len(ms) == 1, f"{name}: expected 1 match for {pattern[:60]!r}, found {len(ms)}"
    return ms[0].group(0)


def plate(label, done, align="left", aria=""):
    """StatusPlate (fight-ui.tsx): done = hairline-strong + check, else amber dashed + dot."""
    just = "flex-start" if align == "left" else "flex-end"
    if done:
        mark = f'<span style="font-family: {MONO}; font-weight: 700; font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; color: {INK}">✓</span>'
        bd, c = f"1px solid {HLS}", INK
    else:
        mark = f'<span style="width: 8px; height: 8px; border-radius: 4px; background: {AMBER}; flex-shrink: 0"></span>'
        bd, c = f"1px dashed {AMBER}", AMBER
    return (f'<div aria-label="{q(aria)}" style="flex: 1; min-width: 0; height: 44px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; '
            f'align-items: center; justify-content: {just}; gap: 8px; border: {bd}; border-radius: 3px">{mark}'
            f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 1.68px; color: {c}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{q(label)}</span></div>')


LIVE_PILL = r'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 3.5px; background: #22C55E"></span>\s*<span style="[^"]*color: #22C55E">LIVE</span>'


# ---- DERIVED frames ----
def weigh_in_initial():
    """faceoff-body.tsx WeighIn before I confirm: CONFIRM WEIGHT plate, opponent WEIGHING IN, Confirm 172.5 lbs, pencil (faceoff-top.tsx:184-197)."""
    s, h = load("21-Faceoff-Weight.dc.html")
    head, _ = s.split("<!-- StatusPlates -->", 1)
    my_w = '<span style="font-family: \'Bebas Neue\', sans-serif; font-size: 36px; line-height: 44px; font-variant-numeric: tabular-nums; color: #E8EDF2">172.5 LBS</span>'
    head = sub1(head, my_w, my_w.replace('color: #E8EDF2">', 'color: #E8EDF2; white-space: nowrap">') + f'<span role="button" aria-label="Edit your profile weight" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center">{SVG_PENCIL}</span>', "weigh-in")
    tail = ('<div style="display: flex; flex-direction: row; gap: 12px">'
            + plate("CONFIRM WEIGHT", False, aria="You, not weighed in")
            + plate("D. OKAFOR WEIGHING IN", False, "right", "D. OKAFOR, not weighed in yet")
            + '</div>'
            f'<a href="21-Faceoff-Weight.dc.html" style="height: 64px; box-sizing: border-box; padding: 0 16px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; background: {RED}; border-radius: 3px; font-family: {DM}; font-weight: 700; font-size: 14px; letter-spacing: 1.12px; text-transform: uppercase; color: {VOID}">Confirm 172.5 lbs</a>'
            '\n  </div>\n</div>')
    return head + tail, h


def ready_variant(both):
    """faceoff-body.tsx ReadyCheck after I tap I'm ready: WAITING FOR D. OKAFOR... or BOTH READY (:149)."""
    s, h = load("22-Ready-Check.dc.html")
    me_block = one(r'<div aria-label="You, waiting".*?</span>\s*</div>', s, "ready")
    opp_block = one(r'<div aria-label="Opponent, ready".*?</span>\s*</div>', s, "ready")
    plates_new = plate("YOU · READY", True, aria="You, ready") + "\n      " + (
        plate("D. OKAFOR · READY", True, "right", "Opponent, ready") if both else plate("D. OKAFOR · NOT READY", False, "right", "Opponent, waiting"))
    s = sub1(s, me_block, plates_new, "ready")
    s = sub1(s, opp_block, "", "ready")
    cta = one(r"<!-- Not ready yet: prompt \+ I'm ready -->.*?</a>\s*</div>", s, "ready")
    msg = "BOTH READY" if both else "WAITING FOR D. OKAFOR..."
    s = sub1(s, cta, f'<div style="display: flex; align-items: center; justify-content: center; padding: 16px 0">{mono(msg, 10, INK3, 500, 2.52)}</div>', "ready")
    # The record switch is disabled once I am ready (faceoff-body.tsx:185).
    s = sub1(s, 'aria-checked="true" aria-label="Record from my phone" style="', 'aria-checked="true" aria-disabled="true" aria-label="Record from my phone" style="opacity: 0.5; ', "ready")
    return s, h


def paused():
    """live-broadcast.tsx with the paused strip (state-strip.tsx:21-27), PAUSED slab (clock-slab.tsx:65), RESUME (pause-button.tsx:39-51)."""
    s, h = load("24-Live-Broadcast.dc.html")
    strip = (f'<div aria-live="polite" style="height: 32px; box-sizing: border-box; padding: 0 12px; display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; '
             f'border-top-left-radius: 4px; border-top-right-radius: 4px; background: {AMBER}">'
             f'<span style="font-family: {MONO}; font-weight: 700; font-size: 11px; line-height: 14px; letter-spacing: 2.52px; font-variant-numeric: tabular-nums; color: {OM_INK}">PAUSED</span>'
             f'<span style="font-family: {MONO}; font-weight: 500; font-size: 10px; line-height: 12px; letter-spacing: 1.68px; font-variant-numeric: tabular-nums; color: {OM_INK}">CAMERA STILL RECORDING</span></div>\n        ')
    s = sub1(s, "<!-- AthleteBar (no strip: rounded top) -->", "<!-- StateStrip paused -->\n        " + strip + "<!-- AthleteBar (flat top under the strip) -->", "paused")
    s = sub1(s, "border-bottom: 0; border-top-left-radius: 4px; border-top-right-radius: 4px", "border-bottom: 0", "paused")
    s = sub1(s, one(LIVE_PILL, s, "paused"), f'<span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 3.5px; background: {AMBER}"></span><span style="font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 2.52px; color: {AMBER}">PAUSED</span>', "paused")
    btn = one(r'<button type="button" aria-label="Pause match clock".*?</button>', s, "paused")
    s = sub1(s, btn, (f'<button type="button" aria-label="Resume match clock" style="flex: 1; min-width: 0; height: 64px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; '
                      f'border-radius: 3px; border: 1px solid {AMBER}; background: {OM_AMBER_SOFT}; padding: 0; cursor: pointer; color: #FFFFFF">{SVG_PLAY}'
                      f'<span style="font-family: {DM}; font-weight: 700; font-size: 14px; line-height: 16px; letter-spacing: 1.12px; color: #FFFFFF">RESUME</span></button>'), "paused")
    return s, h


def opponent_ended():
    """live-broadcast.tsx:141-147 OpponentEndedPlate above the plates, controls gone (:163), slab FINAL (clock-slab.tsx:69)."""
    s, h = load("24-Live-Broadcast.dc.html")
    ended = (f'<div role="alert" style="background: {OM_CHIP}; border: 1px solid {OM_CHIP_B}; border-radius: 4px; padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 6px">'
             f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; line-height: 12px; letter-spacing: 2.52px; font-variant-numeric: tabular-nums; color: {OM_INK3}">MATCH OVER</span>'
             f'<span style="font-family: {BEBAS}; font-size: 40px; line-height: 38px; color: {OM_INK}">D. OKAFOR ENDED THE MATCH</span>'
             f'<span style="font-family: {MONO}; font-weight: 500; font-size: 11px; line-height: 13px; letter-spacing: 0.56px; font-variant-numeric: tabular-nums; color: {OM_INK3}">FINAL CLOCK 01:12 OF 05:00</span></div>\n      ')
    lt = '<!-- Lower third, gap 12 -->\n    <div style="width: 100%; display: flex; flex-direction: column; gap: 12px">'
    s = sub1(s, lt, lt + "\n      <!-- OpponentEndedPlate -->\n      " + ended, "ended")
    s = sub1(s, one(LIVE_PILL, s, "ended"), f'<span style="font-family: {MONO}; font-weight: 700; font-size: 10px; letter-spacing: 2.52px; color: {OM_DIM}">FINAL</span>', "ended")
    s = sub1(s, 'aria-label="2 minutes 46 seconds remaining"', 'aria-label="1 minute 12 seconds remaining"', "ended")
    s = sub1(s, ">02:46</span>", ">01:12</span>", "ended")
    ctr = one(r"<!-- Controls row, height 64, gap 12 -->.*?</a>\s*</div>", s, "ended")
    s = sub1(s, ctr, "<!-- Controls: none once the opponent ended (live-broadcast.tsx:163) -->", "ended")
    return s, h


def end_step():
    """end-step.tsx: shown 800 ms on the device that held to end, then the result form. Wizard padding 16, top inset + 8."""
    s = (f'<div style="width: 390px; height: 844px; box-sizing: border-box; background: {VOID}; color: {INK}; display: flex; flex-direction: column; overflow: hidden; position: relative; padding: 55px 16px 66px 16px; gap: 16px">'
         f'<div style="padding: 28px 3.5px">'
         f'<div style="background: {PLATE}; border: 1px solid {HL}; border-radius: 4px; padding: 28px 14px; display: flex; flex-direction: column; align-items: center; gap: 14px">'
         f'{SVG_CHECK_CIRCLE}'
         f'<span style="font-family: {BEBAS}; font-size: 28px; line-height: 34px; letter-spacing: 1.12px; color: {INK}">MATCH ENDED</span>'
         f'<span style="font-family: {MONO}; font-size: 10px; line-height: 13px; letter-spacing: 2.52px; text-transform: uppercase; font-variant-numeric: tabular-nums; color: {INK3}">Up next: record the result</span>'
         f'</div></div></div>')
    return s, 844


# ---------------------------------------------------------------- layout
def phone(inner, h):
    return (f'<div style="width: {PHONE_W}px; height: {h}px; flex-shrink: 0; position: relative; overflow: hidden; border: 1px solid {HLS}; border-radius: 4px; box-sizing: content-box">'
            f'{inner}</div>')


def frame_cell(fr):
    inner, h = fr["src"]
    kind = chip("Derived from code", INK2, HLS) if fr.get("derived") else chip("Current app " + fr["board"], INK2, HLS)
    who = chip(fr["who"], INK, HLS) if fr.get("who") else ""
    srcs = "".join(f'<div>{mono("source: " + x, 10, INK3, 400, 0.4, False, "white-space: normal; overflow-wrap: anywhere")}</div>' for x in fr["sources"])
    notes = "".join(f'<p style="margin: 0">{body(n, 12, INK2)}</p>' for n in fr.get("notes", []))
    return (f'<div style="width: {PHONE_W + 2}px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0">'
            f'{phone(inner, h)}'
            f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 0 2px">'
            f'<div style="display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap">{mono(fr["step"], 11, INK, 700, 2.52)}{kind}{who}</div>'
            f'{heading(fr["title"], 15, INK)}{notes}'
            f'<div style="display: flex; flex-direction: column; gap: 3px; padding-top: 6px; border-top: 1px solid {HLF}">{srcs}</div>'
            f'</div></div>')


def header(kicker, title, intro):
    return (f'<div style="padding: {PAD}px {PAD}px 0; display: flex; flex-direction: column; gap: 10px">'
            f'<div style="display: flex; flex-direction: row; gap: 12px; align-items: center">{chip("Current app · timekeeper_role OFF · today")}'
            f'{mono(kicker, 10, INK3)}</div>'
            f'<h1 style="margin: 0; font-family: {DM}; font-weight: 700; font-size: 32px; line-height: 40px; color: {INK}">{q(title)}</h1>'
            f'<p style="margin: 0; max-width: 1100px">{body(intro, 15, INK2)}</p></div>')


def row_board(kicker, title, intro, frames):
    n = len(frames)
    w = PAD * 2 + n * (PHONE_W + 2) + (n - 1) * GAP
    cells = "".join(frame_cell(f) for f in frames)
    inner = (header(kicker, title, intro)
             + f'<div style="padding: 32px {PAD}px {PAD}px; display: flex; flex-direction: row; gap: {GAP}px; align-items: flex-start">{cells}</div>')
    return w, inner


def bullets(items):
    return "".join(f'<div style="display: flex; flex-direction: row; gap: 10px; align-items: flex-start"><span style="width: 4px; height: 4px; margin-top: 8px; background: {INK3}; flex-shrink: 0"></span>{body(t, 13, INK2)}</div>' for t in items)


BOARDS = []


def board(file, title):
    def deco(fn):
        BOARDS.append((file, title, fn))
        return fn
    return deco


# ---------------------------------------------------------------- A1
@board("P-TK-A1-Challenge-To-Faceoff.dc.html", "Current (flag off): challenge accepted to face-off")
def a1():
    frames = [
        dict(step="1 · Challenger", title="Challenge sent, waiting on the mat", board="14", who="Challenger",
             src=load("14-Arena-Waiting.dc.html"),
             notes=["The challenger's row shows Sent 9:12 and the On air strip reads Waiting · Dana Okafor with Cancel. Nothing else to do until the opponent answers."],
             sources=["apps/mobile/components/arena/mat-board.tsx:382 (Waiting · name)", "apps/mobile/components/arena/mat-board.tsx:851 (Sent 9:12)",
                      "apps/mobile/lib/arena/use-arena-challenge.ts:1700 (createChallenge)"]),
        dict(step="2 · Opponent", title="Incoming challenge: Decline, Accept, Later", board="15", who="Opponent",
             src=load("15-Challenge-Sheet.dc.html"),
             notes=["Accept is a direct table UPDATE by the opponent only (it carries opponent_weight); then start_match_from_challenge (either side, idempotent) inserts the match as pending with two competitor rows in match_participants. Later only minimizes the prompt; Decline sends a real answer."],
             sources=["apps/mobile/components/arena/challenge-prompt-sheet.tsx:543, 603, 465 (header, line, stakes)",
                      "apps/mobile/components/arena/challenge-prompt-sheet.tsx:659, 698, 730 (Decline, Accept, Later)",
                      "apps/mobile/lib/arena/use-arena-challenge.ts:1850 (acceptChallenge), :1887 (startMatchFromChallenge)"]),
        dict(step="3 · Both phones", title="Into the match wizard: face-off weigh-in", derived=True, who="Both athletes",
             src=weigh_in_initial(),
             notes=["Both devices push /match/<id>, which mounts MatchFlowWizard; status pending maps to the weight step. Confirm 172.5 lbs only sets local state and broadcasts weighed in: the server never learns it (the rated weights come from the challenge). The pencil edits the profile weight for future matches; this match keeps its weigh-in. Check on a device: a decimal weight (172.5 LBS) plus the 44 pt pencil is wider than the half-width column at 390."],
             sources=["apps/mobile/lib/arena/use-arena-challenge.ts:867 (router.push(arenaMatchHref)); lib/arena/constants.ts:54",
                      "apps/mobile/lib/match-flow/step-router.ts:62-63 (pending -> weight)",
                      "apps/mobile/components/match-flow/faceoff/faceoff-top.tsx:107, 184-197 (FACE-OFF · WEIGH IN, pencil)",
                      "apps/mobile/components/match-flow/faceoff/faceoff-body.tsx:46, 69, 75 (Confirm X lbs, plates)",
                      "apps/mobile/lib/match-flow/use-faceoff.ts:303-306 (confirmWeight is local)"]),
    ]
    return row_board("Board A1 of 5 · source " + CODE_REF, "Today: challenge accepted to face-off",
                     "How a ranked Arena match is created today, with no timekeeper. One athlete challenges, the other accepts from the incoming sheet, and the server creates the match as pending with the two athletes as its only participants. Both phones then open the same face-off screen.",
                     frames)


# ---------------------------------------------------------------- A2
@board("P-TK-A2-Faceoff-Weight-Ready.dc.html", "Current (flag off): face-off weigh-in, opponent weight check, ready check, auto-start")
def a2():
    frames = [
        dict(step="2a · Weight check", title="Confirm the opponent's weight", board="21",
             src=load("21-Faceoff-Weight.dc.html"),
             notes=["After my weigh-in, the opponent plate becomes YOUR CHECK. Confirm or Doesn't look right calls check_opponent_weight (a competitor checks the opponent only, pending only), stored in match_weight_checks."],
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-weight-check.tsx:21 (YOUR CHECK), :90 (WEIGHED IN AT), :95, :102",
                      "apps/mobile/lib/match-flow/use-faceoff.ts:314 (checkOpponentWeight)"]),
        dict(step="2b · Flagged", title="I flagged: match on hold, Withdraw flag", board="21b",
             src=load("21b-Faceoff-Flagged.dc.html"),
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-weight-check.tsx:21 (YOU FLAGGED), :68, :71"]),
        dict(step="2c · Flagged athlete", title="Re-weigh to continue", board="21c",
             src=load("21c-Faceoff-Reweigh.dc.html"),
             notes=["The flagged athlete re-weighs (reweigh_for_match); the flagger then checks the new weight again (Waiting for D. Okafor to check your new weight.)."],
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-weight-check.tsx:154 (notice), :180 (Re-weigh), :61 (await recheck)"]),
        dict(step="3a · Ready", title="Ready check: I'm ready", board="22",
             src=load("22-Ready-Check.dc.html"),
             notes=["Ready is broadcast only on channel session-match:<matchId>, repeated every 3 s. The server does not know who is ready."],
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-body.tsx:114, 119, 143, 145",
                      "apps/mobile/lib/match-flow/use-faceoff.ts:224 (broadcastReady)"]),
        dict(step="3b · Weight hold", title="Ready blocked by the weight gate", board="22b",
             src=load("22b-Ready-Hold.dc.html"),
             notes=["I'm ready stays disabled while a flag or recheck holds the match (or while a check is still owed when opponent_weight_check_required is on: WAITING FOR WEIGHT CHECKS)."],
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-body.tsx:125-133 (MATCH ON HOLD · WEIGHT CHECK)"]),
        dict(step="3c · I'm ready", title="Waiting for the opponent", derived=True,
             src=ready_variant(False),
             notes=["The record switch locks once I am ready."],
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-body.tsx:114, 149 (WAITING FOR D. OKAFOR...), :185 (switch disabled)"]),
        dict(step="3d · Both ready", title="BOTH READY: auto-start on both phones", derived=True,
             src=ready_variant(True),
             notes=["There is no Start button. When myReady, opponentReady and canStart are all true, BOTH devices call start_match; the loser of the race reads the match. The line flips to STARTING MATCH... while the call runs. start_match checks participant, pending and the weight gate only (no readiness check), then writes in_progress and started_at and sends the Match Started push."],
             sources=["apps/mobile/components/match-flow/faceoff/faceoff-body.tsx:135-139 (STARTING MATCH...), :149 (BOTH READY)",
                      "apps/mobile/lib/match-flow/use-faceoff.ts:279-281 (auto-start effect), :242 (startMatch)"]),
    ]
    return row_board("Board A2 of 5 · source " + CODE_REF, "Today: face-off (weigh-in, weight check, ready, auto-start)",
                     "Each athlete confirms their own weight, then (when this match has weight checks) confirms or flags the opponent's. A flag holds the match until it is withdrawn, or until the flagged athlete re-weighs and the flagger confirms again. Then both tap I'm ready and both phones start the match on their own.",
                     frames)


# ---------------------------------------------------------------- A3
@board("P-TK-A3-Live.dc.html", "Current (flag off): countdown, live clock, pause and resume, end")
def a3():
    frames = [
        dict(step="4a · Countdown", title="Countdown, recording arms at GO", board="23",
             src=load("23-Countdown.dc.html"),
             sources=["apps/mobile/components/match-flow/countdown/countdown.tsx:170 (REC ARMS AT GO / NOT RECORDING), :208"]),
        dict(step="4b · Live", title="Live: client clock, PAUSE, HOLD TO END", board="24",
             src=load("24-Live-Broadcast.dc.html"),
             notes=["The clock runs on each phone from started_at. Either athlete can pause or hold to end. Each phone that opted in records its own angle (REC mm:ss)."],
             sources=["apps/mobile/components/match-flow/live/rec-tally.tsx:17", "apps/mobile/components/match-flow/live/clock-slab.tsx:63, 76",
                      "apps/mobile/components/match-flow/live/pause-button.tsx:51", "apps/mobile/components/match-flow/live/hold-to-end-button.tsx:143"]),
        dict(step="4c · Paused", title="Paused: amber strip, RESUME", derived=True,
             src=paused(),
             notes=["pause_match and resume_match are server RPCs guarded by can_control_match (participants only; the timekeeper has been excluded since 20261006100000). The other phone follows by broadcast and a DB re-read."],
             sources=["apps/mobile/components/match-flow/live/state-strip.tsx:21-27 (PAUSED, CAMERA STILL RECORDING)",
                      "apps/mobile/components/match-flow/live/clock-slab.tsx:65", "apps/mobile/components/match-flow/live/pause-button.tsx:39-51",
                      "apps/mobile/lib/match-flow/use-live-controls.ts:66, 93 (resumeMatch, pauseMatch)"]),
        dict(step="4d · I ended", title="MATCH ENDED, then the result form", derived=True, who="Phone that held to end",
             src=end_step(),
             notes=["End is broadcast only (match_ended). The match stays in_progress on the server until a result is recorded. This plate shows for 800 ms."],
             sources=["apps/mobile/lib/match-flow/use-live-controls.ts:56 (broadcastMatchEnded)",
                      "apps/mobile/components/match-flow/steps/end-step.tsx:35, 38"]),
        dict(step="4e · Other phone", title="Opponent ended the match", derived=True, who="Other phone",
             src=opponent_ended(),
             notes=["When the opponent's match_ended broadcast lands, the clock freezes, the controls go and this plate shows for 1.5 s before the result step."],
             sources=["apps/mobile/components/match-flow/live/opponent-ended-plate.tsx:37, 45, 51",
                      "apps/mobile/components/match-flow/steps/live-step.tsx:99, 149", "apps/mobile/lib/match-flow/live-view-state.ts:6 (1500 ms)"]),
    ]
    return row_board("Board A3 of 5 · source " + CODE_REF, "Today: live (clock, pause and resume, end, recording)",
                     "Both athletes see the same broadcast screen and both hold the controls. Pause and resume are real server actions; End is a broadcast, so the server only learns the match is over when someone records the result.",
                     frames)


# ---------------------------------------------------------------- A4
@board("P-TK-A4-Result-Confirm.dc.html", "Current (flag off): claim-first result, waiting, confirm or dispute, verdict")
def a4():
    frames = [
        dict(step="5a · Recorder", title="Record result (claim-first)", board="25", who="First to tap",
             src=load("25-Result-Entry.dc.html"),
             notes=["The first athlete to tap a winner or Draw claims the form (an advisory broadcast claim). record_match_result: participant only, in_progress only, loser = the other participant; it completes the match, applies rating v9 and auto-confirms the recorder. It runs through the offline mutationQueue."],
             sources=["apps/mobile/components/match-flow/steps/result-step.tsx:104, 113, 148, 155",
                      "apps/mobile/components/match-flow/steps/result-form.tsx:163, 236",
                      "apps/mobile/lib/match-flow/use-result-claim.ts:24 (winningClaim)", "apps/mobile/lib/match-flow/use-record-result.ts:72 (mutationQueue)"]),
        dict(step="5b · Other athlete", title="Waiting while the opponent records", board="26", who="Other athlete",
             src=load("26-Result-Waiting.dc.html"),
             notes=["A claim not heard from for 20 s unlocks this athlete's form (takeover)."],
             sources=["apps/mobile/components/match-flow/steps/result-waiting.tsx:35, 40, 44, 48",
                      "apps/mobile/components/match-flow/steps/result-step.tsx:70 (claim.state theirs)"]),
        dict(step="6a · Non-recorder", title="Confirm or dispute", board="27", who="Other athlete",
             src=load("27-Confirm.dc.html"),
             notes=["Only the athlete who did not record lands here: the recorder was auto-confirmed and goes straight to the verdict. Leaving without disputing counts as confirming; auto_confirm_locked_results locks it after 24 h."],
             sources=["apps/mobile/components/match-flow/steps/confirm-step.tsx:174, 176, 216, 223, 230, 235",
                      "apps/mobile/lib/match-flow/match-extras.ts:55, 68", "apps/mobile/components/match-flow/match-step-renderer.tsx:162-171 (recorder skips confirm)"]),
        dict(step="6b · Dispute", title="Dispute form", board="28",
             src=load("28-Dispute.dc.html"),
             sources=["apps/mobile/components/match-flow/steps/dispute-form.tsx:42 (disputeMatchResult), :62, :65, :86"]),
        dict(step="7 · Both", title="Verdict summary", board="29",
             src=load("29-Verdict.dc.html"),
             sources=["apps/mobile/components/match-flow/verdict/verdict-step.tsx:169 (YOU WON / YOU LOST / DRAW / DISPUTED), :329 (Share match)",
                      "apps/mobile/lib/arena/constants.ts:51 (Back to Arena)"]),
    ]
    return row_board("Board A4 of 5 · source " + CODE_REF, "Today: result and confirm",
                     "Either athlete records the result; whoever starts first holds the form and the other watches it arrive. The recorder is confirmed automatically, so only the other athlete confirms or disputes. Then both see the verdict.",
                     frames)


# ---------------------------------------------------------------- A5 (state machine)
@board("P-TK-A5-State-Machine.dc.html", "Current (flag off): match state machine, who acts, broadcast vs server")
def a5():
    W = 1440

    def col(status, color, steps, rows):
        cells = "".join(
            f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-top: 1px solid {HLF}">'
            f'{mono(k, 9, INK3, 700, 2.0)}{body(v, 12, INK)}</div>' for k, v in rows)
        return (f'<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; background: {PANEL}; border: 1px solid {HL}; border-radius: 4px; overflow: hidden">'
                f'<div style="padding: 12px; display: flex; flex-direction: column; gap: 6px; border-top: 3px solid {color}">'
                f'{mono(status, 13, color, 700, 1.68, False)}{mono(steps, 10, INK2, 500, 1.68)}</div>{cells}</div>')

    def arrow(t):
        return (f'<div style="width: 96px; flex-shrink: 0; box-sizing: border-box; padding: 18px 6px 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 4px">'
                f'<span style="font-family: {MONO}; font-size: 20px; color: {INK3}">→</span>{mono(t, 9, INK3, 500, 1.0, True, "white-space: normal; text-align: center; overflow-wrap: anywhere; max-width: 84px")}</div>')

    cols = (
        col("pending", AMBER, "wizard: weight, ready", [
            ("Enters by", "start_match_from_challenge (either athlete, idempotent) or _start_invite_booking"),
            ("Who acts", "Both athletes: weigh in, check the opponent's weight, tap ready, Leave"),
            ("Server enforced", "check_opponent_weight and reweigh_for_match (match_weight_checks); the start_match weight gate; cancel_session_match (Leave, any participant)"),
            ("Broadcast only", "Weighed in, ready, recording opt-in (session-match:<id>, every 3 s)"),
            ("Gaps", "No ready column; no cron expires a stale pending match")])
        + arrow("start_match, both phones")
        + col("in_progress", GREEN, "wizard: live, end, result", [
            ("Enters by", "start_match: participant, pending, weight gate; writes started_at; Match Started push"),
            ("Who acts", "Both athletes: pause, resume, hold to end, record the result"),
            ("Server enforced", "pause_match and resume_match (can_control_match, participants only); record_match_result (participant, in_progress)"),
            ("Broadcast only", "End (match_ended), the result claim, the clock itself"),
            ("Gaps", "No cancel once started; End never reaches the server")])
        + arrow("record_match_result")
        + col("completed", INK, "wizard: confirm (non-recorder), summary", [
            ("Enters by", "record_match_result: outcomes, submissions, rating v9 applied, recorder auto-confirmed"),
            ("Who acts", "The athlete who did not record: confirm or dispute (24 h)"),
            ("Server enforced", "confirm_match_result then auto_finalize_match (all confirmed rows vs competitor count); dispute_match_result; auto_confirm_locked_results cron after 24 h"),
            ("Broadcast only", "The recorded result reaches the other phone by broadcast first")])
        + arrow("dispute_match_result")
        + col("disputed", NEG, "wizard: summary (DISPUTED)", [
            ("Enters by", "dispute_match_result inside the 24 h window"),
            ("Who acts", "Admin only: resolve_dispute (service role, rating replay)"),
            ("Also", "voided and cancelled are terminal; cancelled comes from Leave while pending")])
    )
    legend = bullets([
        "Statuses are the matches.status enum (20260604000000:25-27): pending, in_progress, completed, disputed, voided, cancelled. There is no confirmed status: a completed match whose competitors have all confirmed is final, and the wizard shows the summary.",
        "There is no started_by, recorded_by or ready column on matches. Clients cannot INSERT matches, and guard_match_columns silently reverts client writes to control columns.",
        "The mobile wizard steps (step-router.ts) are weight, ready, live, end, result, confirm, summary; pending maps to weight, in_progress to live, completed and disputed to summary. The wizard rejects anyone who is not a participant (match-flow-wizard.tsx:251, Not a participant), so a timekeeper has no screen in the match today; the only timekeeper UI is the film view (timekeeper-film.tsx).",
        "The broadcast channel is public: no broadcast-only signal above may be trusted by a server gate.",
    ])
    inner = (header("Board A5 of 5 · jr_be migrations and " + CODE_REF, "Today: match state machine (two athletes, no timekeeper)",
                    "Who can act at each status, which steps the server enforces, and which are only broadcasts between the two phones. Recon from BRIEF.md section 3, checked against the mobile code.")
             + f'<div style="padding: 32px {PAD}px 0; display: flex; flex-direction: row; align-items: stretch">{cols}</div>'
             + f'<div style="padding: 28px {PAD}px {PAD}px; display: flex; flex-direction: column; gap: 8px; max-width: 1200px">{heading("Notes", 15, INK)}{legend}</div>')
    return W, inner


# ---------------------------------------------------------------- output
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
    bj = os.path.join(HERE, "boards_a.json")
    prev = {b["file"]: b["h"] for b in json.load(open(bj))} if os.path.exists(bj) else {}
    files = [b[0] for b in BOARDS]
    for old in os.listdir(OUT):
        if old.startswith("P-TK-A") and old not in files:
            os.remove(os.path.join(OUT, old))
    written = []
    for file, title, fn in BOARDS:
        w, inner = fn()
        h = prev.get(file, 2000)
        if do_measure:
            mh = measure(page(title, w, h, inner))
            assert mh, f"measure failed for {file}"
            h = mh
        html = page(title, w, h, inner)
        assert not any(c in html for c in BANNED), f"dash in {file}"
        open(os.path.join(OUT, file), "w").write(html)
        written.append({"id": file.replace(".dc.html", ""), "file": file, "title": title, "w": w, "h": h})
    json.dump(written, open(bj, "w"), indent=2, ensure_ascii=False)
    print("\n".join(f'{b["file"]} {b["w"]}x{b["h"]}' for b in written))


if __name__ == "__main__":
    main()
