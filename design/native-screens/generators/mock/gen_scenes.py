"""Illustrated mock camera scenes for the ELO RATED canvas (no real people or venues).

Writes three SVGs: cam_22.svg (16:9 wide pre-match), cam_23.svg (9:16 hands touch at GO),
cam_24.svg (9:16 grappling on the mat).
"""
import os

OUT = os.environ.get("NATIVE_SCREENS_MOCK_OUT", os.getcwd())

SKIN_A = "#c68a62"
SKIN_B = "#8d5a3b"
SKIN_R = "#b07850"
HAIR = "#1b1510"


def defs(w, h, horizon):
    return f"""<defs>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1a1d24"/><stop offset="1" stop-color="#3a3f4a"/>
</linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#2a2d33"/><stop offset="1" stop-color="#15171b"/>
</linearGradient>
<linearGradient id="mat" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#2b2e35"/><stop offset="1" stop-color="#1c1e23"/>
</linearGradient>
<linearGradient id="matred" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8f2a31"/><stop offset="1" stop-color="#b8323c"/>
</linearGradient>
<radialGradient id="light" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#fff6e0" stop-opacity="0.9"/>
  <stop offset="0.25" stop-color="#fff1d0" stop-opacity="0.35"/>
  <stop offset="1" stop-color="#fff1d0" stop-opacity="0"/>
</radialGradient>
<radialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
</radialGradient>
<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75">
  <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
</radialGradient>
<radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#000" stop-opacity="0.5"/>
  <stop offset="1" stop-color="#000" stop-opacity="0"/>
</radialGradient>
</defs>"""


def room(w, h, horizon, mat_poly_outer, mat_poly_inner, tape_lines):
    s = [f'<rect width="{w}" height="{h}" fill="url(#wall)"/>']
    # upper wall panels and a plain banner (no text, no branding)
    s.append(f'<rect x="0" y="{horizon*0.52:.0f}" width="{w}" height="{horizon*0.04:.0f}" fill="#4a505c" opacity="0.6"/>')
    s.append(f'<rect x="{w*0.30:.0f}" y="{horizon*0.20:.0f}" width="{w*0.40:.0f}" height="{horizon*0.14:.0f}" rx="3" fill="#e8edf2" opacity="0.14"/>')
    s.append(f'<rect x="{w*0.30:.0f}" y="{horizon*0.31:.0f}" width="{w*0.40:.0f}" height="{horizon*0.02:.0f}" fill="#e63946" opacity="0.5"/>')
    # ceiling lights
    for i, fx in enumerate([0.12, 0.38, 0.62, 0.88]):
        cy = horizon * (0.08 + 0.03 * (i % 2))
        s.append(f'<ellipse cx="{w*fx:.0f}" cy="{cy:.0f}" rx="{w*0.16:.0f}" ry="{w*0.07:.0f}" fill="url(#light)"/>')
        s.append(f'<rect x="{w*fx-w*0.025:.0f}" y="{cy-3:.0f}" width="{w*0.05:.0f}" height="6" rx="3" fill="#fffaf0"/>')
    # railing
    s.append(f'<rect x="0" y="{horizon*0.70:.0f}" width="{w}" height="3" fill="#6b7280" opacity="0.5"/>')
    for i in range(0, 40):
        x = i * w / 39
        s.append(f'<rect x="{x:.0f}" y="{horizon*0.70:.0f}" width="2" height="{horizon*0.12:.0f}" fill="#6b7280" opacity="0.35"/>')
    # spectators: soft silhouettes along the horizon
    import random
    rnd = random.Random(7)
    tones = ["#0f1115", "#23262d", "#3b3f48", "#15171c", "#2d3038"]
    for i in range(46):
        x = rnd.uniform(-10, w + 10)
        sc = rnd.uniform(0.8, 1.15) * (w / 780) * 1.0
        hh = 70 * sc
        base = horizon + rnd.uniform(-4, 4)
        c = rnd.choice(tones)
        s.append(f'<rect x="{x-9*sc:.0f}" y="{base-hh*0.78:.0f}" width="{18*sc:.0f}" height="{hh*0.78:.0f}" rx="{7*sc:.0f}" fill="{c}" opacity="0.85"/>')
        s.append(f'<circle cx="{x:.0f}" cy="{base-hh*0.86:.0f}" r="{7*sc:.1f}" fill="{c}" opacity="0.9"/>')
    # floor
    s.append(f'<rect x="0" y="{horizon}" width="{w}" height="{h-horizon}" fill="url(#floor)"/>')
    # mat
    s.append(f'<polygon points="{mat_poly_outer}" fill="url(#matred)"/>')
    s.append(f'<polygon points="{mat_poly_inner}" fill="url(#mat)"/>')
    for (x1, y1, x2, y2) in tape_lines:
        s.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#e8edf2" stroke-opacity="0.28" stroke-width="3"/>')
    return "\n".join(s)


def limb(pts, width, color):
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width:.1f}" stroke-linecap="round" stroke-linejoin="round"/>'


def person(fx, fy, H, pose, top, bottom, skin, hair=HAIR, mirror=False, sleeves=True):
    """Standing figure. fx,fy = point between feet. pose: dict of joints in units of H, x to the right."""
    m = -1 if mirror else 1

    def P(key):
        x, y = pose[key]
        return (fx + m * x * H, fy + y * H)

    out = [f'<ellipse cx="{fx:.0f}" cy="{fy:.0f}" rx="{H*0.28:.0f}" ry="{H*0.05:.0f}" fill="url(#shadow)"/>']
    # back arm first
    arm_col = top if sleeves else skin
    out.append(limb([P("sh_b"), P("el_b"), P("ha_b")], H * 0.06, arm_col))
    out.append(f'<circle cx="{P("ha_b")[0]:.1f}" cy="{P("ha_b")[1]:.1f}" r="{H*0.032:.1f}" fill="{skin}"/>')
    # legs
    out.append(limb([P("hip_b"), P("kn_b"), P("ft_b")], H * 0.085, bottom))
    out.append(limb([P("hip_f"), P("kn_f"), P("ft_f")], H * 0.085, bottom))
    for k in ("ft_b", "ft_f"):
        x, y = P(k)
        out.append(f'<ellipse cx="{x + m*H*0.02:.1f}" cy="{y:.1f}" rx="{H*0.045:.1f}" ry="{H*0.018:.1f}" fill="{skin}"/>')
    # torso
    out.append(limb([P("neck"), P("hip")], H * 0.2, top))
    # front arm
    out.append(limb([P("sh_f"), P("el_f"), P("ha_f")], H * 0.06, arm_col))
    out.append(f'<circle cx="{P("ha_f")[0]:.1f}" cy="{P("ha_f")[1]:.1f}" r="{H*0.032:.1f}" fill="{skin}"/>')
    # head
    hx, hy = P("head")
    out.append(f'<circle cx="{hx:.1f}" cy="{hy:.1f}" r="{H*0.068:.1f}" fill="{skin}"/>')
    out.append(f'<path d="M{hx - H*0.07:.1f},{hy:.1f} A{H*0.07:.1f},{H*0.07:.1f} 0 0 1 {hx + H*0.07:.1f},{hy:.1f} Q{hx:.1f},{hy - H*0.02:.1f} {hx - H*0.07:.1f},{hy:.1f} Z" fill="{hair}"/>')
    return "\n".join(out)


STAND = dict(
    head=(0.0, -0.925), neck=(0.0, -0.83), hip=(0.0, -0.5),
    sh_f=(0.07, -0.8), el_f=(0.1, -0.64), ha_f=(0.1, -0.5),
    sh_b=(-0.07, -0.8), el_b=(-0.1, -0.64), ha_b=(-0.1, -0.5),
    hip_f=(0.04, -0.5), kn_f=(0.06, -0.26), ft_f=(0.08, 0.0),
    hip_b=(-0.04, -0.5), kn_b=(-0.06, -0.26), ft_b=(-0.08, 0.0),
)

# athletic stance: knees bent, hands up, leaning forward
STANCE = dict(
    head=(0.08, -0.86), neck=(0.05, -0.77), hip=(-0.02, -0.46),
    sh_f=(0.1, -0.74), el_f=(0.2, -0.62), ha_f=(0.27, -0.7),
    sh_b=(0.0, -0.74), el_b=(0.1, -0.58), ha_b=(0.17, -0.64),
    hip_f=(0.02, -0.46), kn_f=(0.12, -0.25), ft_f=(0.14, 0.0),
    hip_b=(-0.06, -0.46), kn_b=(-0.12, -0.24), ft_b=(-0.16, 0.0),
)

# reaching forward for the hand touch
REACH = dict(STANCE, el_f=(0.22, -0.7), ha_f=(0.34, -0.72))

REF = dict(STAND, el_f=(0.13, -0.66), ha_f=(0.08, -0.54), el_b=(-0.13, -0.66), ha_b=(-0.08, -0.54))
REF_SIGNAL = dict(STAND, el_f=(0.16, -0.72), ha_f=(0.3, -0.76))


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">\n{body}\n</svg>\n'


def scene_22():
    w, h = 1280, 720
    hz = 250
    outer = f"-200,{h+40} {w+200},{h+40} {w-150},{hz+40} 150,{hz+40}"
    inner = f"-40,{h+40} {w+40},{h+40} {w-230},{hz+70} 230,{hz+70}"
    tape = [(w/2, hz+70, w/2, h+40)]
    parts = [defs(w, h, hz), room(w, h, hz, outer, inner, tape)]
    parts.append(f'<ellipse cx="{w/2}" cy="{hz+250}" rx="520" ry="160" fill="url(#pool)"/>')
    parts.append(person(410, 560, 250, STANCE, "#111318", "#111318", SKIN_A))
    parts.append(person(870, 560, 255, STANCE, "#e8e4da", "#2b3140", SKIN_B, mirror=True))
    parts.append(person(640, 510, 250, REF, "#0b0c0f", "#4b4f58", SKIN_R))
    parts.append(f'<rect width="{w}" height="{h}" fill="url(#vignette)"/>')
    return svg(w, h, "\n".join(parts))


def scene_23():
    w, h = 780, 1386
    hz = 600
    outer = f"-300,{h+40} {w+300},{h+40} {w-40},{hz+30} 40,{hz+30}"
    inner = f"-160,{h+40} {w+160},{h+40} {w-100},{hz+60} 100,{hz+60}"
    tape = [(w*0.62, hz+60, w*0.82, h+40)]
    parts = [defs(w, h, hz), room(w, h, hz, outer, inner, tape)]
    parts.append(f'<ellipse cx="{w/2}" cy="{hz+380}" rx="420" ry="180" fill="url(#pool)"/>')
    parts.append(person(400, 880, 330, REF_SIGNAL, "#0b0c0f", "#4b4f58", SKIN_R))
    parts.append(person(215, 1000, 390, REACH, "#111318", "#111318", SKIN_A))
    parts.append(person(575, 1000, 395, REACH, "#e8e4da", "#2b3140", SKIN_B, mirror=True))
    parts.append(f'<rect width="{w}" height="{h}" fill="url(#vignette)"/>')
    return svg(w, h, "\n".join(parts))


def scene_24():
    w, h = 780, 1386
    hz = 620
    outer = f"-300,{h+40} {w+300},{h+40} {w-40},{hz+30} 40,{hz+30}"
    inner = f"-160,{h+40} {w+160},{h+40} {w-100},{hz+60} 100,{hz+60}"
    tape = [(w*0.30, hz+60, w*0.05, h+40)]
    parts = [defs(w, h, hz), room(w, h, hz, outer, inner, tape)]
    parts.append(f'<ellipse cx="{w*0.55}" cy="{hz+400}" rx="420" ry="190" fill="url(#pool)"/>')
    # referee on the left, watching
    parts.append(person(120, 900, 360, REF, "#0b0c0f", "#4b4f58", SKIN_R))
    # the pile: bottom athlete on their back in guard, top athlete passing
    X, Y, U = 450, 1000, 450
    g = []
    g.append(f'<ellipse cx="{X}" cy="{Y+10}" rx="{U*0.75:.0f}" ry="{U*0.12:.0f}" fill="url(#shadow)"/>')
    # bottom athlete (white top), lying toward the right, legs up around the top athlete
    g.append(limb([(X+U*0.40, Y-U*0.02), (X+U*0.05, Y-U*0.05)], U*0.2, "#e8e4da"))           # torso
    g.append(f'<circle cx="{X+U*0.56:.0f}" cy="{Y-U*0.05:.0f}" r="{U*0.068:.0f}" fill="{SKIN_B}"/>')  # head
    g.append(limb([(X+U*0.02, Y-U*0.06), (X-U*0.16, Y-U*0.34), (X-U*0.36, Y-U*0.24)], U*0.085, "#2b3140"))  # leg over back
    g.append(limb([(X+U*0.00, Y-U*0.02), (X-U*0.22, Y-U*0.02), (X-U*0.40, Y+U*0.02)], U*0.085, "#2b3140"))  # bottom leg
    g.append(f'<ellipse cx="{X-U*0.38:.0f}" cy="{Y-U*0.24:.0f}" rx="{U*0.045:.0f}" ry="{U*0.02:.0f}" fill="{SKIN_B}"/>')
    g.append(f'<ellipse cx="{X-U*0.42:.0f}" cy="{Y+U*0.02:.0f}" rx="{U*0.045:.0f}" ry="{U*0.02:.0f}" fill="{SKIN_B}"/>')
    # top athlete (dark), kneeling, chest down over the bottom athlete's torso
    g.append(limb([(X-U*0.10, Y-U*0.02), (X-U*0.26, Y-U*0.10)], U*0.09, "#111318"))           # shin/knee on mat
    g.append(limb([(X-U*0.26, Y-U*0.10), (X-U*0.10, Y-U*0.28)], U*0.09, "#111318"))           # thigh
    g.append(limb([(X-U*0.10, Y-U*0.28), (X+U*0.30, Y-U*0.22)], U*0.2, "#111318"))            # torso
    g.append(f'<circle cx="{X+U*0.40:.0f}" cy="{Y-U*0.22:.0f}" r="{U*0.068:.0f}" fill="{SKIN_A}"/>')  # head
    g.append(f'<path d="M{X+U*0.33:.0f},{Y-U*0.22:.0f} A{U*0.07:.0f},{U*0.07:.0f} 0 0 1 {X+U*0.47:.0f},{Y-U*0.24:.0f} Z" fill="{HAIR}"/>')
    g.append(limb([(X+U*0.22, Y-U*0.26), (X+U*0.34, Y-U*0.10), (X+U*0.46, Y-U*0.02)], U*0.06, "#111318"))  # underhook arm
    g.append(f'<circle cx="{X+U*0.47:.0f}" cy="{Y-U*0.02:.0f}" r="{U*0.032:.0f}" fill="{SKIN_A}"/>')
    # bottom athlete's arm framing on the top athlete's shoulder
    g.append(limb([(X+U*0.30, Y-U*0.08), (X+U*0.20, Y-U*0.20), (X+U*0.26, Y-U*0.32)], U*0.06, "#e8e4da"))
    g.append(f'<circle cx="{X+U*0.26:.0f}" cy="{Y-U*0.33:.0f}" r="{U*0.032:.0f}" fill="{SKIN_B}"/>')
    parts.append("\n".join(g))
    parts.append(f'<rect width="{w}" height="{h}" fill="url(#vignette)"/>')
    return svg(w, h, "\n".join(parts))


for name, fn in (("cam_22", scene_22), ("cam_23", scene_23), ("cam_24", scene_24)):
    with open(os.path.join(OUT, name + ".svg"), "w") as f:
        f.write(fn())
print("ok")
