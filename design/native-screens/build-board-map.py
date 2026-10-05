#!/usr/bin/env python3
"""Regenerates (or checks) board-map.json: which source files affect which "Current app" board.

How it works: each board names the route file(s) it draws ("seeds"). The script follows
relative, "@/" and "@jits/shared" imports from those seeds, collecting every route and
component file reached. Imports from a barrel (an index.ts that re-exports, such as
"@/components/ui" or "@jits/shared/utils") resolve to the files that define the imported
names, not to the whole barrel. Type-only imports are ignored (they draw nothing).

- lib/ and hooks/: kept only when they decide what text or state is drawn (copy, formatting,
  view models; LIB_OK). Data plumbing (queries, stores, hooks, bootstraps) is not traversed.
- packages/shared: kept only for the allowlisted copy and format files (SHARED_OK); never
  traversed further.
- "global": the import closure of GLOBAL_SEEDS (tokens, theme, NativeWind config, root
  layout). Those files affect every board and are listed once, not per board.
- Where every source file in a folder is used, it is written as "<folder>/**".

Files are read from a git ref (default HEAD), so uncommitted work never leaks into the map.

Usage (from anywhere):
  python3 design/native-screens/build-board-map.py                 # rewrite from HEAD
  python3 design/native-screens/build-board-map.py --ref <sha>     # rewrite from a commit
  python3 design/native-screens/build-board-map.py --check         # exit 2 if the committed map is stale
  python3 design/native-screens/build-board-map.py --canvas <scratch>/project/canvas.json
Titles and board order come from the existing board-map.json unless --canvas is given.
--check exits 0 when board-map.json matches what the builder produces, 2 when it is stale
(and says which boards differ), 1 on error. It never writes.
When a board is added to or removed from the "Current app" page, add or remove its entry in
BOARDS below and rerun with --canvas so the check against the canvas index passes.
Hand edits to board-map.json are overwritten by a rerun: put them in BOARDS ("extra").
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
MAP = os.path.join(HERE, "board-map.json")
CANVAS_URL = "https://claude.ai/artifact/PJWm2WeqsG56HS13jHsd5D"
M = "apps/mobile/"
SH = "packages/shared/src/"


# ---------------------------------------------------------------------------
# Repo access at a git ref (one cat-file process for all reads)
# ---------------------------------------------------------------------------
class Tree:
    def __init__(self, ref):
        self.ref = ref
        out = subprocess.run(["git", "-C", REPO, "-c", "core.quotePath=false", "ls-tree", "-r", "-z",
                              "--name-only", ref], capture_output=True, check=True).stdout
        self.files = set(x.decode() for x in out.split(b"\0") if x)
        self.proc = None
        self.cache = {}

    def isfile(self, p):
        return p in self.files

    def read(self, p):
        if p in self.cache:
            return self.cache[p]
        if self.proc is None:
            self.proc = subprocess.Popen(["git", "-C", REPO, "cat-file", "--batch"],
                                         stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.proc.stdin.write(("%s:%s\n" % (self.ref, p)).encode())
        self.proc.stdin.flush()
        header = self.proc.stdout.readline().split()
        if len(header) < 3 or header[1] != b"blob":
            self.cache[p] = ""
            return ""
        data = self.proc.stdout.read(int(header[2]))
        self.proc.stdout.read(1)
        self.cache[p] = data.decode("utf-8", "replace")
        return self.cache[p]

    def under(self, d):
        pre = d.rstrip("/") + "/"
        return [f for f in self.files if f.startswith(pre)]


T = None  # set in main()

# ---------------------------------------------------------------------------
# Import resolution
# ---------------------------------------------------------------------------
STMT = re.compile(r"""(import|export)\s+(type\s+)?([^'";]*?)\s*from\s+['"]([^'"]+)['"]""", re.S)
BARE = re.compile(r"""import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)""")
EXPORT_DECL = re.compile(r"export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+(\w+)")
EXPORT_LIST = re.compile(r"export\s*\{([^}]*)\}\s*(?:;|$)", re.M)


def resolve(src, spec):
    if spec.startswith("@/"):
        base = M + spec[2:]
    elif spec == "@jits/shared":
        base = SH + "index"
    elif spec.startswith("@jits/shared/"):
        base = SH + spec[len("@jits/shared/"):]
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else:
        return None
    for c in [base + e for e in (".tsx", ".ts", ".js")] + [base + "/index" + e for e in (".tsx", ".ts")]:
        if T.isfile(c):
            return c
    return None


def names_of(clause):
    """Imported original names for `{ a, b as c, type d }`; None for default or namespace."""
    m = re.search(r"\{([^}]*)\}", clause)
    if not m or re.sub(r"\{[^}]*\}", "", clause).strip(" ,\n"):
        return None
    out = []
    for part in m.group(1).split(","):
        part = part.strip()
        if not part or part.startswith("type "):
            continue
        out.append(part.split(" as ")[0].strip())
    return out


def is_barrel(path):
    return os.path.basename(path).startswith("index.") and bool(re.search(r"export\s+(\*|\{)[^;]*from", T.read(path)))


def local_exports(path):
    t = T.read(path)
    names = set(EXPORT_DECL.findall(t))
    for m in EXPORT_LIST.finditer(t):
        for part in m.group(1).split(","):
            part = part.strip()
            if part:
                names.add(part.split(" as ")[-1].replace("type ", "").strip())
    return names


def barrel_lookup(barrel, name, depth=0):
    """File(s) defining `name` re-exported by `barrel`, or None if not found."""
    if depth > 5:
        return None
    t = T.read(barrel)
    stars = []
    for m in STMT.finditer(t):
        kind, typ, clause, spec = m.groups()
        if kind != "export":
            continue
        target = resolve(barrel, spec)
        if not target:
            continue
        if clause.strip().startswith("*") and " as " not in clause:
            stars.append(target)
            continue
        for part in re.sub(r"[{}]", "", clause).split(","):
            part = part.strip().replace("type ", "")
            if not part:
                continue
            orig, _, alias = part.partition(" as ")
            if (alias or orig).strip() == name:
                orig = orig.strip()
                if is_barrel(target):
                    return barrel_lookup(target, "default" if orig == "default" else orig, depth + 1) or [target]
                return [target]
    if name in local_exports(barrel):
        return [barrel]
    for s in stars:
        if is_barrel(s):
            r = barrel_lookup(s, name, depth + 1)
            if r:
                return r
        elif name in local_exports(s):
            return [s]
    return None


def barrel_all(barrel):
    return [r for m in STMT.finditer(T.read(barrel)) if m.group(1) == "export" for r in [resolve(barrel, m.group(4))] if r]


def deps(path):
    t = T.read(path)
    out = []
    for m in STMT.finditer(t):
        kind, typ, clause, spec = m.groups()
        if typ:
            continue
        target = resolve(path, spec)
        if not target:
            continue
        names = names_of(clause) if kind == "import" else None
        if names is not None and is_barrel(target):
            for n in names:
                out += barrel_lookup(target, n) or barrel_all(target)
        elif names == [] :
            continue  # only type imports inside the braces
        else:
            out.append(target)
    for m in BARE.finditer(t):
        target = resolve(path, m.group(1) or m.group(2))
        if target:
            out.append(target)
    return out


# ---------------------------------------------------------------------------
# What counts
# ---------------------------------------------------------------------------
# Changes to these, and to everything they render (their import closure), affect every board.
GLOBAL_SEEDS = [
    "apps/mobile/app/_layout.tsx",
    "apps/mobile/global.css",
    "apps/mobile/lib/cn.ts",
    "apps/mobile/lib/theme/**",
    "apps/mobile/lib/tokens.ts",
    "apps/mobile/tailwind.config.js",
]
# Mounted by the root layout but only visible in one state, so they are mapped to the boards
# that draw that state (01 splash, 48 offline + update banners) instead of made global.
GLOBAL_EXCLUDE = [
    M + "components/offline-banner.tsx",
    M + "components/updates/ota-update-bootstrap.tsx",
    M + "components/error-boundary.tsx",
    M + "components/ui/elo-system/splash-glow-statement.tsx",
    M + "components/ui/elo-system/splash-reveal.tsx",
    M + "components/ui/elo-system/splash-statement.tsx",
    M + "components/ui/toast.tsx",
    M + "lib/splash/splash-variant.ts",
    M + "lib/splash/elo-cache.ts",
]
# Never counted as drift even when they sit inside a mapped folder.
IGNORE = ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx", "**/*.snap", "**/*.md"]

# lib/ files kept in a board's sources: the ones that decide what text or state is drawn.
LIB_OK = re.compile(
    r"(copy|format|constants|rows|card-status|header-chip-model|mat-board|notification-items"
    r"|live-view-state|step-router|validation|filter-submissions|splash-variant|elo-cache"
    r"|app-version|upload-banner-state|go-live-feedback|clamp-finish|parse-finish|recording-limits"
    r"|regenerate-mode|update-policy|fresh-countdown|match-extras|record|(?<![-\w])tab-badge"
    # Video upload states (jits-n2im.22): the hooks and tables that decide the verdict, match
    # page and Film Room upload copy, captions, CTA label and Try again / Discard actions.
    r"|use-match-film|use-verdict-data|film-section|use-upload-actions|upload-errors|upload-capabilities"
    r"|recording-space)\.tsx?$"
)
# packages/shared files whose strings or formatting are drawn on boards.
SHARED_OK = {SH + p for p in [
    "utils/tos-content.ts", "utils/shared.ts", "utils/milestones.ts", "utils/key-moments.ts",
    "utils/highlight-caption.ts", "utils/share.ts", "utils/match-detection.ts",  # NO_MATCH_COPY
    "constants/highlights.ts",
]}
# The notification panel is mounted under every header bell but only drawn open on board 42.
PANEL = {M + p for p in [
    "components/notifications/notification-panel.tsx",
    "components/notifications/notification-item.tsx",
    "components/notifications/bell-bootstrap.tsx",
    "lib/notifications/notification-items.ts",
]}


def expand(globs):
    out = []
    for g in globs:
        out += T.under(g[:-3]) if g.endswith("/**") else ([g] if T.isfile(g) else [])
    return [f for f in out if re.search(r"\.(tsx?|js|css)$", f)]


def walk(seeds, exclude=(), panel_rule=True):
    """Files reached from seeds (repo-relative), following the rules above."""
    ex = set(exclude)
    if panel_rule and not (PANEL & set(seeds)):
        ex |= PANEL
    seen, out, st = set(), set(), list(seeds)
    while st:
        rel = st.pop()
        if rel in seen or rel in ex:
            continue
        seen.add(rel)
        if not T.isfile(rel):
            sys.exit("missing file at %s: %s" % (T.ref, rel))
        seed = rel in seeds
        if rel.startswith(SH):
            if rel in SHARED_OK or seed:
                out.add(rel)
            continue  # never traverse into shared
        if rel.startswith((M + "lib/", M + "hooks/")) and not rel.startswith(M + "lib/theme/"):
            if LIB_OK.search(rel) or seed:
                out.add(rel)
            if not seed:
                continue  # do not traverse through data / plumbing modules
        else:
            out.add(rel)
        if rel.endswith((".ts", ".tsx", ".js")):
            st += deps(rel)
    return out


AUTH = ["app/(auth)/_layout.tsx"]
SETUP = ["app/profile-setup.tsx", "lib/profile-setup/validation.ts"]
PS = "components/profile-setup/"
TOS, WHO, WHERE = PS + "tos-step.tsx", PS + "identity-step.tsx", PS + "training-step.tsx"
APP = ["app/(app)/_layout.tsx"]
TABS = APP + ["app/(app)/(tabs)/_layout.tsx"]
HOME = TABS + ["app/(app)/(tabs)/(home)/_layout.tsx", "app/(app)/(tabs)/(home)/index.tsx"]
ARENA = TABS + ["app/(app)/(tabs)/arena/_layout.tsx", "app/(app)/(tabs)/arena/index.tsx"]
PROFILE = TABS + ["app/(app)/(tabs)/profile/_layout.tsx"]
SETTINGS = APP + ["app/(app)/settings/_layout.tsx"]
MF = "components/match-flow/"
# Every step body of the match wizard; each match board keeps only the steps it draws.
ALLSTEPS = [MF + x for x in [
    "faceoff/faceoff-body.tsx", "countdown/live-stage.tsx", "countdown/countdown.tsx",
    "steps/live-step.tsx", "steps/result-step.tsx", "steps/result-waiting.tsx",
    "steps/result-form.tsx", "steps/confirm-step.tsx", "steps/dispute-form.tsx",
    "verdict/verdict-step.tsx", "steps/end-step.tsx", "steps/wait-step.tsx",
    "match-recorder-surface.tsx", "camera-overlay.tsx",
]]


def match(*keep):
    kept = [MF + k for k in keep]
    return dict(seeds=APP + ["app/(app)/match/[matchId].tsx"] + kept,
                exclude=[s for s in ALLSTEPS if s not in kept])


# Upload copy and error classes read through lib files (card-status, upload-banner-state) that
# the walk does not traverse (jits-n2im.22).
UPLOAD_LIB = [M + "lib/video/upload-copy.ts", M + "lib/video/upload-errors.ts"]

HV = "components/highlight-viewer/"
SHARE_ONLY = [HV + x for x in ["pre-share-sheet.tsx", "share-sheet-body.tsx", "share-progress.tsx",
                               "share-failed.tsx", "share-returned.tsx"]]

# seeds: route/component files the board draws (paths relative to apps/mobile)
# exclude: files reachable from the seeds that this board's state does not show
# extra: literal repo-relative paths or globs added as-is (non-code inputs)
BOARDS = {
    # The board draws the JS splash (SplashGlowStatement, mounted in app/_layout.tsx), not the
    # native splash image, so app.json is deliberately not listed (it changes on every version bump).
    "01-Splash.dc.html": dict(
        seeds=["components/ui/elo-system/splash-glow-statement.tsx", "components/ui/elo-system/splash-reveal.tsx",
               "lib/splash/splash-variant.ts", "lib/splash/elo-cache.ts"]),
    "02-Login.dc.html": dict(seeds=AUTH + ["app/(auth)/login.tsx"]),
    "03-Signup.dc.html": dict(seeds=AUTH + ["app/(auth)/signup.tsx"]),
    "04-Signup-Confirm.dc.html": dict(seeds=AUTH + ["app/(auth)/signup.tsx"]),
    "05-Forgot-Password.dc.html": dict(seeds=AUTH + ["app/(auth)/forgot-password.tsx"]),
    "06-Setup-Terms.dc.html": dict(seeds=SETUP, exclude=[WHO, WHERE]),
    "07-Setup-Who.dc.html": dict(seeds=SETUP, exclude=[TOS, WHERE]),
    "08-Setup-Where.dc.html": dict(seeds=SETUP, exclude=[TOS, WHO]),
    "Main.dc.html": dict(seeds=HOME, exclude=[
        "components/dashboard/resume-match-card.tsx", "components/dashboard/new-highlight-card.tsx",
        "components/dashboard/practice-offer-card.tsx"]),
    "11-Home-Resume.dc.html": dict(seeds=HOME),
    "12-Arena-Offline.dc.html": dict(seeds=ARENA),
    "13-Arena-Live.dc.html": dict(seeds=ARENA),
    "14-Arena-Waiting.dc.html": dict(seeds=ARENA),
    # Home with the incoming-challenge sheet open (mounted by ArenaBootstrap).
    "15-Challenge-Sheet.dc.html": dict(
        seeds=HOME + ["lib/arena/arena-bootstrap.tsx", "components/arena/challenge-prompt-sheet.tsx"]),
    "16-Rankings.dc.html": dict(
        seeds=TABS + ["app/(app)/(tabs)/leaderboard/_layout.tsx", "app/(app)/(tabs)/leaderboard/index.tsx"]),
    # card-status (a lib file, so not traversed) reads the upload copy and error classes.
    "17-Profile.dc.html": dict(seeds=PROFILE + ["app/(app)/(tabs)/profile/index.tsx"],
                               exclude=["components/share-profile-sheet.tsx"], extra=UPLOAD_LIB),
    "18-Profile-Stats.dc.html": dict(seeds=PROFILE + ["app/(app)/(tabs)/profile/stats.tsx"]),
    "21-Faceoff-Weight.dc.html": match("faceoff/faceoff-body.tsx"),
    "22-Ready-Check.dc.html": match("faceoff/faceoff-body.tsx", "match-recorder-surface.tsx", "camera-overlay.tsx"),
    "21b-Faceoff-Flagged.dc.html": match("faceoff/faceoff-body.tsx", "faceoff/faceoff-weight-check.tsx"),
    "21c-Faceoff-Reweigh.dc.html": match("faceoff/faceoff-body.tsx", "faceoff/faceoff-weight-check.tsx"),
    "22b-Ready-Hold.dc.html": match("faceoff/faceoff-body.tsx", "faceoff/faceoff-weight-check.tsx", "match-recorder-surface.tsx", "camera-overlay.tsx"),
    "23-Countdown.dc.html": match("countdown/live-stage.tsx", "countdown/countdown.tsx",
                                  "match-recorder-surface.tsx", "camera-overlay.tsx"),
    "24-Live-Broadcast.dc.html": match("countdown/live-stage.tsx", "steps/live-step.tsx",
                                       "match-recorder-surface.tsx", "camera-overlay.tsx"),
    "25-Result-Entry.dc.html": match("steps/result-step.tsx", "steps/result-form.tsx"),
    "26-Result-Waiting.dc.html": match("steps/result-step.tsx", "steps/result-waiting.tsx", "steps/result-form.tsx"),
    "27-Confirm.dc.html": match("steps/confirm-step.tsx"),
    "28-Dispute.dc.html": match("steps/confirm-step.tsx", "steps/dispute-form.tsx"),
    "29-Verdict.dc.html": match("verdict/verdict-step.tsx"),
    "31-Film-Room.dc.html": dict(seeds=APP + ["app/(app)/film-room.tsx"], extra=UPLOAD_LIB),
    "32-Match-Detail.dc.html": dict(seeds=APP + ["app/(app)/match-detail/[matchId].tsx"], extra=UPLOAD_LIB),
    "33-Video-Player.dc.html": dict(seeds=APP + ["app/(app)/video/[id].tsx"]),
    "34-Highlight-Viewer.dc.html": dict(seeds=APP + ["app/(app)/highlight/[id].tsx"],
                                        exclude=SHARE_ONLY + [HV + "viewer-improve-sheet.tsx"]),
    # The pre-share caption is built by use-highlight-share (a hook, so not traversed) from
    # the shared highlight-caption util; list it explicitly.
    "35-Highlight-Share.dc.html": dict(seeds=APP + ["app/(app)/highlight/[id].tsx", "lib/highlight-share/share-copy.ts"],
                                       exclude=[HV + "viewer-improve-sheet.tsx"],
                                       extra=["packages/shared/src/utils/highlight-caption.ts"]),
    "36-Athlete.dc.html": dict(seeds=APP + ["app/(app)/athlete/[id].tsx"], exclude=["components/compare-stats-modal.tsx"]),
    "37-Compare-Stats.dc.html": dict(seeds=APP + ["app/(app)/athlete/[id].tsx"]),
    "41-Practice.dc.html": dict(seeds=APP + ["app/(app)/practice.tsx"], exclude=ALLSTEPS),
    # Home with the bell's notification panel open.
    "42-Notifications-Panel.dc.html": dict(
        seeds=HOME + ["components/notifications/bell-bootstrap.tsx", "components/notifications/notification-panel.tsx",
                      "lib/notifications/notification-items.ts"]),
    "43-Settings.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/index.tsx"]),
    "44-Settings-Notifications.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/notifications.tsx"]),
    "45-Feedback.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/feedback.tsx"]),
    "46-Help.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/help.tsx"]),
    "47-Admin.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/admin.tsx"]),
    # Home with the offline banner and the OTA update banner (both mounted in app/_layout.tsx).
    "48-System-Overlays.dc.html": dict(
        seeds=HOME + ["components/offline-banner.tsx", "components/updates/ota-update-bootstrap.tsx",
                      "lib/updates/update-policy.ts"]),
    # Admin repeat disputers list (Settings > Admin > Repeat disputers).
    "49-Admin-Disputers.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/admin/disputers.tsx"]),
    # Invites, friends & location (jr_be spec 016, shipped dark in 41d79a4; drawn flag-on).
    "50-Invite-Challenge.dc.html": dict(seeds=APP + ["app/(app)/invite/index.tsx"]),
    "51-Invite-Join.dc.html": dict(seeds=APP + ["app/(app)/invite/join.tsx"]),
    "52-Invite-Claim.dc.html": dict(seeds=APP + ["app/(app)/invite/claim.tsx", "app/c/[token].tsx"]),
    "53-Invite-Setup.dc.html": dict(seeds=["app/invite-setup.tsx"]),
    "54-Invite-Code.dc.html": dict(seeds=AUTH + ["app/(auth)/invite-code.tsx"]),
    "55-Friends.dc.html": dict(seeds=APP + ["app/(app)/friends.tsx"]),
    "56-Delete-Account.dc.html": dict(seeds=SETTINGS + ["app/(app)/settings/delete-account.tsx"]),
    "57-Arena-Nearby.dc.html": dict(seeds=ARENA),
    # Offline Arena with the Go Live location sheet (mounted by ArenaBootstrap).
    "58-Go-Live-Location.dc.html": dict(
        seeds=ARENA + ["lib/arena/arena-bootstrap.tsx", "components/arena/go-live-location-sheet.tsx"]),
    "59-Start-Blocked.dc.html": dict(
        seeds=ARENA + ["lib/arena/arena-bootstrap.tsx", "components/arena/start-blocked-sheet.tsx"]),
    "60-Arena-Booked.dc.html": dict(seeds=ARENA),
    "61-Home-Invite.dc.html": dict(seeds=HOME),
}


def collapse(files):
    """Replace a folder's files with "<folder>/**" when every source file in it is used."""
    files = set(files)
    res = set(files)
    for d in sorted({os.path.dirname(f) for f in files}, key=len):
        allf = {f for f in T.under(d) if f.endswith((".ts", ".tsx")) and "__tests__" not in f
                and not re.search(r"\.test\.tsx?$", f)}
        if allf and allf <= files and d.count("/") >= 3:
            res = {f for f in res if not f.startswith(d + "/")} | {d + "/**"}
    globs = [g for g in res if g.endswith("/**")]
    return sorted(f for f in res if not any(f != g and f.startswith(g[:-2]) for g in globs))


def glob_re(glob):
    """Same semantics as drift.mjs: **, * and ? are special, everything else is literal."""
    out, i = "", 0
    while i < len(glob):
        c = glob[i]
        if c == "*":
            if glob[i + 1:i + 2] == "*":
                if (i == 0 or glob[i - 1] == "/") and glob[i + 2:i + 3] == "/":
                    out += "(?:.*/)?"
                    i += 3
                    continue
                out += ".*"
                i += 2
                continue
            out += "[^/]*"
        elif c == "?":
            out += "[^/]"
        else:
            out += re.escape(c)
        i += 1
    return re.compile("^" + out + "$")


def undrawn_files(globs):
    """Screen and component files that no board or global glob claims (screens with no board)."""
    pats = [glob_re(g) for g in globs]
    return sorted(
        f for f in T.files
        if f.startswith((M + "app/", M + "components/")) and f.endswith((".ts", ".tsx"))
        and "__tests__" not in f and not re.search(r"\.test\.tsx?$", f)
        and not any(p.match(f) for p in pats)
    )


def build(titles, order):
    global_files = walk(expand(GLOBAL_SEEDS), GLOBAL_EXCLUDE, panel_rule=True)
    global_globs = sorted(set(GLOBAL_SEEDS) | set(
        f for f in collapse(global_files) if not any(glob_re(g).match(f) for g in GLOBAL_SEEDS)))
    out = {
        "canvas": CANVAS_URL,
        "generated_by": "design/native-screens/build-board-map.py",
        "ignore": IGNORE,
        "global": global_globs,
        "boards": {},
    }
    for name in order:
        cfg = BOARDS[name]
        files = walk([M + s for s in cfg["seeds"]], [M + e for e in cfg.get("exclude", ())]) - global_files
        srcs = collapse(files) + [e for e in cfg.get("extra", []) if e not in files]
        out["boards"][name] = {"title": titles.get(name, name), "sources": sorted(set(srcs))}
    # Known screens and components that no board draws (admin subpages, redirects, unused steps).
    # drift.mjs does not report changes to these as "unmapped"; a NEW unclaimed file still shows.
    out["undrawn"] = undrawn_files(out["global"] + [g for b in out["boards"].values() for g in b["sources"]])
    return out


def main():
    global T
    args = sys.argv[1:]
    ref = args[args.index("--ref") + 1] if "--ref" in args else "HEAD"
    try:
        T = Tree(ref)
    except subprocess.CalledProcessError:
        sys.exit("cannot read git ref %s" % ref)
    if "--canvas" in args:
        canvas = json.load(open(args[args.index("--canvas") + 1]))
        titles = {k: v["title"] for k, v in canvas["boards"].items()}
        current = [k for k in canvas["order"] if canvas["boards"].get(k, {}).get("page", "current") == "current"]
        if sorted(current) != sorted(BOARDS):
            sys.exit("BOARDS does not match the canvas 'Current app' page: %s" % sorted(set(current) ^ set(BOARDS)))
        order = current
    else:
        old = json.load(open(MAP))
        titles = {k: v["title"] for k, v in old["boards"].items()}
        order = [k for k in old["boards"] if k in BOARDS] + [k for k in BOARDS if k not in old["boards"]]
    out = build(titles, order)
    text = json.dumps(out, indent=2) + "\n"
    if "--check" in args:
        old = json.load(open(MAP))
        if old == out:
            print("board map is up to date (%s)" % ref)
            return 0
        print("board map stale: design/native-screens/board-map.json differs from the builder at %s." % ref)
        for k in ("global", "ignore", "undrawn"):
            if old.get(k) != out.get(k):
                print("  %s differs" % k)
        for b in sorted(set(old.get("boards", {})) | set(out["boards"])):
            o = old.get("boards", {}).get(b, {}).get("sources")
            n = out["boards"].get(b, {}).get("sources")
            if o != n:
                add = sorted(set(n or []) - set(o or []))
                rem = sorted(set(o or []) - set(n or []))
                print("  %s: +%s -%s" % (b, add, rem))
        print("Fix: python3 design/native-screens/build-board-map.py && commit board-map.json")
        return 2
    with open(MAP, "w") as fh:
        fh.write(text)
    print("wrote %s from %s (%d boards)" % (os.path.relpath(MAP, REPO), ref, len(out["boards"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
