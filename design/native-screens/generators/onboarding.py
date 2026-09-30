#!/usr/bin/env python3
"""Generates onboarding artboards 01-08 (static markup, no runtime scripting)."""
import os

OUT = os.environ.get("NATIVE_SCREENS_OUT", os.path.join(os.getcwd(), "project"))

# Dark tokens (lib/tokens.ts darkTokens)
SURFACE = "#0D0F14"
SURFACE2 = "#13151B"
SURFACE3 = "#1E222B"
INK = "#E8EDF2"
INK2 = "#9CA3AF"
INK3 = "#8D929D"
CTA = "#E63946"
CTA_TEXT = "#EC6A74"
ON_CTA = "#0D0F14"
HAIR = "rgba(107,114,128,.45)"
HAIR_STRONG = "rgba(107,114,128,.62)"

DISPLAY = "'Bebas Neue',sans-serif"
HEAD = "'DM Sans',sans-serif"
BODY = "'Inter',sans-serif"
MONO = "'JetBrains Mono',monospace"

FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500;700&display=swap">'


def page(title, body):
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
<div style="width: 390px; height: 844px; box-sizing: border-box; background: #0D0F14; color: #E8EDF2; display: flex; flex-direction: column; overflow: hidden; position: relative">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":844}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""


# ---------- primitives ----------

def wordmark(px):
    # components/ui/elo-system/wordmark.tsx: font-display text-ink tracking-mark, lineHeight = fontSize
    return (f'<div style="font-family: {DISPLAY}; font-size: {px}px; line-height: {px}px; '
            f'letter-spacing: -0.07px; color: {INK}">ELO RATED</div>')


def mono_caption(text, tracking):
    # font-mono text-[11px] text-ink-3 uppercase tracking-*
    return (f'<div style="font-family: {MONO}; font-size: 11px; line-height: 14px; color: {INK3}; '
            f'text-transform: uppercase; letter-spacing: {tracking}px; text-align: center">{text}</div>')


def hero(px, caption, tracking, gap):
    return (f'<div style="display: flex; flex-direction: column; align-items: center; gap: {gap}px">'
            f'{wordmark(px)}{mono_caption(caption, tracking)}</div>')


def plate(inner, gap):
    # Plate default: bg-surface-3 border border-hairline rounded-md p-4 (border-l 1px hairline)
    return (f'<div style="background: {SURFACE3}; border: 1px solid {HAIR}; border-radius: 4px; padding: 14px; '
            f'display: flex; flex-direction: column; gap: {gap}px">{inner}</div>')


def field_label(text, for_id):
    # font-heading text-[10px] text-ink-3 uppercase tracking-caps-xl
    return (f'<label for="{for_id}" style="font-family: {HEAD}; font-weight: 700; font-size: 10px; line-height: 13px; '
            f'color: {INK3}; text-transform: uppercase; letter-spacing: 2.52px">{text}</label>')


def helper(text):
    return f'<div style="font-family: {BODY}; font-size: 12px; line-height: 16px; color: {INK3}">{text}</div>'


EYE = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
       'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
       '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>'
       '<circle cx="12" cy="12" r="3"></circle></svg>')

CHEVRON_LEFT = ('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>')


def text_input(id_, value, placeholder, input_type="text", password=False):
    # bg-surface-3 border rounded-xs px-4 py-3 text-[14px] font-body text-ink border-hairline-strong (pr-11 when password)
    pr = 38.5 if password else 14
    inp = (f'<input id="{id_}" type="{input_type}" value="{value}" placeholder="{placeholder}" readonly="" '
           f'style="box-sizing: border-box; width: 100%; background: {SURFACE3}; border: 1px solid {HAIR_STRONG}; '
           f'border-radius: 2px; padding: 10.5px {pr}px 10.5px 14px; font-family: {BODY}; font-size: 14px; line-height: 18px; '
           f'color: {INK}; outline: none; margin: 0">')
    if not password:
        return inp
    return (f'<div style="position: relative; display: flex; flex-direction: column; justify-content: center">{inp}'
            f'<button type="button" aria-label="Show password" style="position: absolute; right: 10.5px; top: 50%; '
            f'transform: translateY(-50%); background: none; border: 0; padding: 0; margin: 0; color: {INK3}; '
            f'display: flex; cursor: pointer">{EYE}</button></div>')


def auth_field(id_, label, value, placeholder, input_type="text", password=False):
    # AuthFormField: View gap-2
    return (f'<div style="display: flex; flex-direction: column; gap: 7px">{field_label(label, id_)}'
            f'{text_input(id_, value, placeholder, input_type, password)}</div>')


def elo_field(id_, label, control, helper_text=None):
    # EloField: gap-2, label, control, helper
    h = helper(helper_text) if helper_text else ""
    return f'<div style="display: flex; flex-direction: column; gap: 7px">{field_label(label, id_)}{control}{h}</div>'


CTA_TXT = (f"font-family: {HEAD}; font-weight: 700; font-size: 14px; line-height: 18px; "
           f"text-transform: uppercase; letter-spacing: 1.68px")


def cta(label, href=None, disabled=False):
    # CtaButton: bg-cta items-center justify-center rounded-sm px-5 py-4; text font-heading 14 ink-on-cta uppercase caps-l
    op = "opacity: 0.5; " if disabled else ""
    style = (f"{op}display: flex; align-items: center; justify-content: center; background: {CTA}; border: 0; "
             f"border-radius: 3px; padding: 14px 17.5px; margin: 0; color: {ON_CTA}; {CTA_TXT}; cursor: pointer")
    if href:
        return f'<a href="{href}" style="{style}">{label}</a>'
    return f'<button type="button" style="{style}">{label}</button>'


def secondary(label):
    style = (f"display: flex; align-items: center; justify-content: center; background: {SURFACE3}; "
             f"border: 1px solid {HAIR_STRONG}; border-radius: 3px; padding: 14px 17.5px; margin: 0; color: {INK}; "
             f"{CTA_TXT}; cursor: pointer")
    return f'<button type="button" style="{style}">{label}</button>'


def tertiary(label, href=None):
    # TertiaryButton: items-center justify-center px-5 py-3; font-heading 14 ink-2 uppercase caps-l
    style = (f"display: flex; align-items: center; justify-content: center; background: none; border: 0; "
             f"padding: 10.5px 17.5px; margin: 0; color: {INK2}; {CTA_TXT}; cursor: pointer")
    if href:
        return f'<a href="{href}" style="{style}">{label}</a>'
    return f'<button type="button" style="{style}">{label}</button>'


def mono_link(lead, red, href):
    # text-center font-mono text-[11px] text-ink-2 uppercase tracking-caps-l, nested text-cta
    return (f'<a href="{href}" style="display: block; text-align: center; font-family: {MONO}; font-size: 11px; '
            f'line-height: 14px; color: {INK2}; text-transform: uppercase; letter-spacing: 1.68px">'
            f'{lead} <span style="color: {CTA_TEXT}">{red}</span></a>')


def app_header(title, back_href=None):
    # AppHeader: bg-surface-2 border-b hairline, paddingTop insets.top(47), height 56+47, px 16
    if back_href:
        back = (f'<a href="{back_href}" aria-label="Go back" style="width: 28px; height: 28px; display: flex; '
                f'align-items: center; justify-content: center; border-radius: 2px; color: {INK2}">{CHEVRON_LEFT}</a>')
    else:
        back = ""
    return (f'<div style="flex: none; box-sizing: border-box; height: 103px; padding: 47px 16px 0 16px; '
            f'background: {SURFACE2}; border-bottom: 1px solid {HAIR}; display: flex; flex-direction: row; align-items: center">'
            f'<div style="flex: 1 1 0; height: 32px; display: flex; align-items: center">{back}</div>'
            f'<div style="max-width: 50%; flex-shrink: 1; display: flex; align-items: center; justify-content: center; gap: 7px">'
            f'<div style="font-family: {HEAD}; font-weight: 700; font-size: 12px; line-height: 16px; color: {INK2}; '
            f'text-transform: uppercase; letter-spacing: 1.68px; white-space: nowrap">{title}</div></div>'
            f'<div style="flex: 1 1 0; height: 32px"></div></div>')


def scroll(inner, pad_v=24, center=False, offset=0):
    # offset: draw the ScrollView scrolled down by N px (content slides up under the header edge).
    jc = "justify-content: center; " if center else ""
    content = (f'<div style="box-sizing: border-box; padding: {pad_v}px 24px; display: flex; flex-direction: column; '
               f'{jc}gap: 24px; flex: 1; margin-top: -{offset}px">{inner}</div>')
    return f'<div style="flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column">{content}</div>'



# ---------- 01 Splash (default variant: SplashGlowStatement, resting frame) ----------

def splash():
    # splash-glow-statement.tsx: BLOCK_W = min(390-48, 360) = 342; FITTED_SIZE = min(80, floor(342/(9*0.46))) = 80;
    # WORD_GAP = round(80*0.32) = 26. At rest the E-R mark glyph/dot opacity is 0 (not drawn). No glow styling in code.
    letters = lambda t: "".join(
        f'<span style="font-family: {DISPLAY}; font-size: 80px; line-height: 80px; color: {INK}">{c}</span>' for c in t)
    body = f"""<a href="02-Login.dc.html" aria-label="Continue to sign in" style="position: absolute; inset: 0; background: {SURFACE}; display: flex; flex-direction: column; align-items: center; justify-content: center; color: {INK}">
  <div style="max-width: 342px; display: flex; flex-direction: column; align-items: stretch; transform: translateY(12px)">
    <div style="font-family: {HEAD}; font-weight: 700; font-size: 15px; line-height: 20px; letter-spacing: 6.3px; color: {INK2}; margin-bottom: 14px; transform: translateY(-8px)">WE ARE</div>
    <div style="display: flex; flex-direction: row; justify-content: center">{letters("ELO")}<div style="width: 26px"></div>{letters("RATED")}</div>
    <div style="align-self: flex-end; margin-top: 0; font-family: {HEAD}; font-weight: 700; font-size: 24px; line-height: 31px; letter-spacing: 3.6px; color: {CTA}; text-align: right">ARE YOU?</div>
  </div>
</a>"""
    return page("Splash: statement", body)


# ---------- 02 Login ----------

def version_label():
    return (f'<div style="text-align: center; font-family: {MONO}; font-size: 9px; line-height: 12px; color: {INK3}; '
            f'letter-spacing: 1.12px">v0.4.0 (23) · Embedded</div>')


def login():
    form = plate(
        auth_field("login-email", "Email", "marcus.reyes@example.com", "you@example.com", "email")
        + auth_field("login-password", "Password", "correcthorse", "Your password", "password", password=True)
        + cta("Sign In", "Main.dc.html")
        + secondary("Continue with Google"),
        17.5,
    )
    links = (f'<div style="display: flex; flex-direction: column; gap: 10.5px">'
             f'{mono_link("Don&#39;t have an account?", "Register", "03-Signup.dc.html")}'
             f'{tertiary("Forgot password?", "05-Forgot-Password.dc.html")}</div>')
    content = hero(72, "What&#39;s your number?", 2.52, 10.5) + form + links + version_label()
    body = (f'<div style="flex: 1; min-height: 0; box-sizing: border-box; padding: 47px 0 34px 0; display: flex; flex-direction: column">'
            f'{scroll(content, pad_v=32, center=True)}</div>')
    return page("Login", body)


# ---------- 03 Signup ----------

def signup():
    form = plate(
        auth_field("signup-email", "Email", "marcus.reyes@example.com", "you@example.com", "email")
        + auth_field("signup-password", "Password", "correcthorse", "At least 8 characters", "password", password=True)
        + auth_field("signup-confirm", "Confirm Password", "correcthorse", "Re-enter password", "password", password=True)
        + cta("Continue", "04-Signup-Confirm.dc.html"),
        17.5,
    )
    content = (hero(48, "Step 1 of 2 / Account", 1.68, 7) + form
               + mono_link("Already have an account?", "Sign in", "02-Login.dc.html"))
    body = app_header("Create Account", "02-Login.dc.html") + scroll(content)
    return page("Signup", body)


# ---------- 04 Signup confirm ----------

def body_text(text, color=INK):
    return f'<p style="margin: 0; font-family: {BODY}; font-size: 14px; line-height: 21px; color: {color}">{text}</p>'


def signup_confirm():
    card = plate(
        body_text("We sent a confirmation link to marcus.reyes@example.com. Tap it to activate your account, then sign in.")
        + cta("Back to Sign In", "02-Login.dc.html"),
        14,
    )
    content = hero(48, "Check Your Email", 1.68, 7) + card
    body = app_header("Create Account", "02-Login.dc.html") + scroll(content)
    return page("Signup: check email", body)


# ---------- 05 Forgot password ----------

def forgot():
    form = plate(
        body_text("Enter the email address linked to your account. We&#39;ll send you a link to reset your password.", INK2)
        + auth_field("reset-email", "Email", "marcus.reyes@example.com", "you@example.com", "email")
        + cta("Send Reset Email"),
        17.5,
    )
    content = hero(48, "Send Reset Link", 1.68, 7) + form + tertiary("Back to Sign In", "02-Login.dc.html")
    body = app_header("Reset Password", "02-Login.dc.html") + scroll(content)
    return page("Forgot password", body)


# ---------- Profile setup ----------

def progress(idx, total, label):
    pips = "".join(
        f'<div style="height: 3.5px; width: 42px; background: {CTA if i <= idx else HAIR_STRONG}"></div>'
        for i in range(total))
    return (f'<div style="display: flex; flex-direction: column; gap: 10.5px">'
            f'<div style="display: flex; flex-direction: column; align-items: center; gap: 3.5px">'
            f'<div style="font-family: {MONO}; font-size: 10px; line-height: 13px; color: {INK3}; text-transform: uppercase; letter-spacing: 2.52px">Step {idx + 1} of {total}</div>'
            f'<div style="font-family: {HEAD}; font-weight: 700; font-size: 14px; line-height: 18px; color: {INK}; text-transform: uppercase; letter-spacing: 1.68px">{label}</div></div>'
            f'<div role="progressbar" aria-label="Profile setup progress" aria-valuemin="1" aria-valuemax="{total}" aria-valuenow="{idx + 1}" '
            f'style="display: flex; flex-direction: row; justify-content: center; gap: 7px">{pips}</div></div>')


def setup_page(title, step_idx, step_label, step_markup, offset=0):
    wizard = (f'<div style="display: flex; flex-direction: column; gap: 21px">'
              f'{progress(step_idx, 3, step_label)}{step_markup}</div>')
    content = hero(48, "What&#39;s your number?", 1.68, 7) + wizard
    body = app_header("Setup") + scroll(content, offset=offset)
    return page(title, body)


TOS_BLOCKS = [
    ("para", "By creating an account and using ELO RATED, you acknowledge and accept the following terms:"),
    ("sec", "1. Assumption of Risk", "Brazilian Jiu-Jitsu is a full-contact martial art that carries inherent risks of physical injury, including but not limited to sprains, fractures, concussions, and joint damage. You voluntarily assume all risks associated with participating in BJJ matches arranged through this platform."),
    ("sec", "2. Liability Release", "You release ELO RATED, its operators, and affiliated parties from any and all liability for injuries, damages, or losses sustained during training or competition facilitated through this app. This release applies to claims arising from negligence or any other cause of action."),
    ("sec", "3. Facility Rules", "You agree to follow all rules, guidelines, and safety protocols established by the host gym or training facility where your sessions and matches take place. Failure to comply may result in account suspension."),
    ("sec", "4. Health and Insurance", "You confirm that you are in adequate physical condition to participate in BJJ competition and that you maintain health insurance or accept full financial responsibility for any medical treatment resulting from your participation."),
    ("sec", "5. Code of Conduct", "You agree to compete with good sportsmanship, respect your training partners, and report any unsafe behavior through the app. Harassment, unsportsmanlike conduct, or intentional harm to opponents will result in permanent account removal."),
]


def setup_terms():
    parts = [f'<div style="font-family: {HEAD}; font-weight: 700; font-size: 14px; line-height: 18px; color: {INK}; '
             f'text-transform: uppercase; letter-spacing: 1.12px; margin-bottom: 10.5px">TERMS OF SERVICE AND LIABILITY WAIVER</div>']
    for b in TOS_BLOCKS:
        if b[0] == "para":
            parts.append(f'<p style="margin: 0 0 10.5px 0; font-family: {BODY}; font-size: 13px; line-height: 21px; color: {INK2}">{b[1]}</p>')
        else:
            parts.append(f'<div style="margin-bottom: 10.5px">'
                         f'<div style="font-family: {HEAD}; font-weight: 500; font-size: 13px; line-height: 21px; color: {INK}">{b[1]}</div>'
                         f'<p style="margin: 0; font-family: {BODY}; font-size: 13px; line-height: 21px; color: {INK2}">{b[2]}</p></div>')
    tos_plate = (f'<div style="box-sizing: border-box; max-height: 360px; background: {SURFACE3}; border: 1px solid {HAIR}; '
                 f'border-radius: 4px; padding: 14px; overflow: hidden">'
                 f'<div style="padding-bottom: 4px">{"".join(parts)}</div></div>')
    checkbox = (f'<button type="button" role="checkbox" aria-checked="true" style="display: flex; flex-direction: row; align-items: center; '
                f'gap: 10.5px; padding: 0 3.5px; margin: 0; background: none; border: 0; text-align: left; cursor: pointer">'
                f'<span style="box-sizing: border-box; flex: none; width: 17.5px; height: 17.5px; display: flex; align-items: center; justify-content: center; '
                f'border-radius: 2px; border: 1px solid {CTA}; background: {CTA}; font-family: {MONO}; font-weight: 700; font-size: 11px; line-height: 11px; color: {ON_CTA}">&#10003;</span>'
                f'<span style="flex: 1; font-family: {BODY}; font-size: 14px; line-height: 18px; color: {INK}">I agree to the End User Agreement</span></button>')
    step = (f'<div style="display: flex; flex-direction: column; gap: 14px">{tos_plate}{checkbox}'
            f'{cta("I Acknowledge", "07-Setup-Who.dc.html")}{tertiary("Exit", "02-Login.dc.html")}</div>')
    return setup_page("Setup: terms", 0, "End User Agreement", step)


def select_trigger(id_, shown, placeholder, aria_title):
    # SearchSelect closed trigger: bg-surface-3 border hairline-strong rounded-xs h-12 px-4, text 14 body, trailing ⌕ ink-3
    color = INK if shown else INK3
    return (f'<button type="button" id="{id_}" aria-label="{aria_title}, {shown or placeholder}" style="box-sizing: border-box; width: 100%; height: 42px; '
            f'padding: 0 14px; margin: 0; background: {SURFACE3}; border: 1px solid {HAIR_STRONG}; border-radius: 2px; '
            f'display: flex; flex-direction: row; align-items: center; justify-content: space-between; cursor: pointer; text-align: left">'
            f'<span style="flex: 1; font-family: {BODY}; font-size: 14px; line-height: 18px; color: {color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{shown or placeholder}</span>'
            f'<span style="margin-left: 7px; font-size: 14px; line-height: 18px; color: {INK3}">&#8981;</span></button>')


def gender_chip(label, active):
    bg, border, color = (CTA, CTA, ON_CTA) if active else (SURFACE3, HAIR_STRONG, INK)
    return (f'<button type="button" role="radio" aria-checked="{"true" if active else "false"}" style="flex: 1; display: flex; align-items: center; '
            f'justify-content: center; border-radius: 2px; border: 1px solid {border}; background: {bg}; padding: 10.5px 14px; margin: 0; '
            f'font-family: {HEAD}; font-weight: 700; font-size: 12px; line-height: 16px; color: {color}; text-transform: uppercase; '
            f'letter-spacing: 1.68px; cursor: pointer">{label}</button>')


def wizard_footer(back_href):
    return tertiary("Back", back_href) + tertiary("Sign Out", "02-Login.dc.html")


def setup_who():
    fields = (
        elo_field("first-name", "First Name", text_input("first-name", "Marcus", "First name"),
                  "Your name as it will appear to other athletes.")
        + elo_field("last-name", "Last Name", text_input("last-name", "Reyes", "Last name"))
        + elo_field("gender", "Gender",
                    f'<div id="gender" role="radiogroup" style="display: flex; flex-direction: row; gap: 7px">'
                    f'{gender_chip("Male", True)}{gender_chip("Female", False)}</div>',
                    "Used for competition brackets.")
        + elo_field("dob", "Date of Birth", select_trigger_plain("dob", "March 14, 1996"))
        + cta("Continue", "08-Setup-Where.dc.html")
    )
    step = plate(fields, 17.5) + wizard_footer("06-Setup-Terms.dc.html")
    # Content is ~24px taller than the viewport; draw it scrolled 32px so Sign Out and the bottom padding show.
    return setup_page("Setup: who are you", 1, "Who Are You", step, offset=32)


def select_trigger_plain(id_, shown):
    # DateOfBirthPicker trigger: bg-surface-3 border hairline-strong rounded-xs h-12 px-4, no trailing glyph
    return (f'<button type="button" id="{id_}" style="box-sizing: border-box; width: 100%; height: 42px; padding: 0 14px; margin: 0; '
            f'background: {SURFACE3}; border: 1px solid {HAIR_STRONG}; border-radius: 2px; display: flex; align-items: center; '
            f'text-align: left; cursor: pointer; font-family: {BODY}; font-size: 14px; line-height: 18px; color: {INK}">{shown}</button>')


def setup_where():
    fields = (
        elo_field("weight", "Weight (lbs)", text_input("weight", "170", "e.g. 155"), "Used for weight class matching.")
        + elo_field("home-gym", "Home Gym", select_trigger("home-gym", "Atos Austin (Austin)", "Select your gym", "Home Gym"),
                    "Required to activate your profile and appear to other athletes.")
        + elo_field("city", "City", select_trigger("city", "Austin", "Select your city", "City"),
                    "Required to activate your profile. The city you train in.")
        + cta("Get Started", "Main.dc.html")
    )
    step = plate(fields, 17.5) + wizard_footer("07-Setup-Who.dc.html")
    return setup_page("Setup: where you train", 2, "Where You Train", step)


FILES = {
    "01-Splash.dc.html": splash,
    "02-Login.dc.html": login,
    "03-Signup.dc.html": signup,
    "04-Signup-Confirm.dc.html": signup_confirm,
    "05-Forgot-Password.dc.html": forgot,
    "06-Setup-Terms.dc.html": setup_terms,
    "07-Setup-Who.dc.html": setup_who,
    "08-Setup-Where.dc.html": setup_where,
}

if __name__ == "__main__":
    for name, fn in FILES.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(fn())
        print("wrote", name)
