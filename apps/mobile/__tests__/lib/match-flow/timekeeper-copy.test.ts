/**
 * `TIMEKEEPER_COPY` (lib/match-flow/timekeeper-copy.ts): every timekeeper-mode
 * string keyed by its copy deck id (COPY-DECK.md Rounds 1 to 8; spec 12;
 * M-R4). Each entry is pinned to the deck's exact words with the deck's
 * sample names (`M. Reyes`, `D. Okafor`, timekeeper `J. Cruz`), and no string
 * has an em dash, an exclamation mark or an emoji (spec 14.9 X1).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCountdown, SHIPPED_COPY, TIMEKEEPER_COPY as C, type TimekeeperCopyId } from "@/lib/match-flow/timekeeper-copy";
import { mapTimekeeperError, TIMEKEEPER_DECK_MESSAGES } from "@jits/shared/api/timekeeper";
import { domainErrorFromHint } from "@jits/shared/api/errors";

const A = "M. Reyes";
const B = "D. Okafor";
const NAME = "J. Cruz";
const AB = { a: A, b: B };

/** Every id, rendered with the deck's sample values. */
const RENDERED: Record<TimekeeperCopyId, unknown> = {
  "TK-AR1": C["TK-AR1"],
  "TK-AR2": C["TK-AR2"],
  "TK-P1": C["TK-P1"],
  "TK-P2": C["TK-P2"],
  "TK-P3": C["TK-P3"],
  "TK-W1": [C["TK-W1"].text(119), C["TK-W1"].a11y(119)],
  "TK-P4": C["TK-P4"],
  "TK-P5": C["TK-P5"],
  "TK-P5b": C["TK-P5b"](A),
  "TK-P6": C["TK-P6"],
  "TK-P7": [C["TK-P7"].text, C["TK-P7"].a11y(NAME)],
  "TK-P8": C["TK-P8"],
  "TK-P9": C["TK-P9"],
  "TK-P12": C["TK-P12"],
  "TK-P13": C["TK-P13"],
  "TK-P14": C["TK-P14"],
  "TK-P15": C["TK-P15"],
  "TK-P16": C["TK-P16"],
  "TK-P17": C["TK-P17"](NAME),
  "TK-P18": C["TK-P18"],
  "TK-P19": C["TK-P19"],
  "TK-P20": C["TK-P20"]({ athlete: A, name: NAME }),
  "TK-P21": C["TK-P21"](NAME),
  "TK-P22": C["TK-P22"](NAME),
  "TK-P23": C["TK-P23"](NAME),
  "TK-W2": C["TK-W2"],
  "TK-T1": C["TK-T1"],
  "TK-T2": C["TK-T2"],
  "TK-T3": C["TK-T3"],
  "TK-T4": C["TK-T4"],
  "TK-T5": C["TK-T5"](65),
  "TK-T6": C["TK-T6"],
  "TK-T7": C["TK-T7"],
  "TK-T8": C["TK-T8"],
  "TK-F1": C["TK-F1"],
  "TK-F2": C["TK-F2"],
  "TK-F3": C["TK-F3"],
  "TK-F4": C["TK-F4"],
  "TK-F5": C["TK-F5"](NAME),
  "TK-F6": C["TK-F6"](NAME),
  "TK-F7": C["TK-F7"](NAME),
  "TK-K0": C["TK-K0"],
  "TK-K1": C["TK-K1"],
  "TK-K2": C["TK-K2"],
  "TK-K3": C["TK-K3"],
  "TK-K4": C["TK-K4"],
  "TK-K5": C["TK-K5"],
  "TK-K6": C["TK-K6"],
  "TK-K7": C["TK-K7"],
  "TK-K8": C["TK-K8"],
  "TK-K9": C["TK-K9"],
  "TK-K10": C["TK-K10"],
  "TK-K11": C["TK-K11"],
  "TK-K12": C["TK-K12"],
  "TK-K14": C["TK-K14"](AB),
  "TK-K16": C["TK-K16"],
  "TK-K17": C["TK-K17"],
  "TK-L0": C["TK-L0"],
  "TK-L1": C["TK-L1"],
  "TK-L2": C["TK-L2"](NAME),
  "TK-L3": C["TK-L3"],
  "TK-L4": C["TK-L4"],
  "TK-R1": C["TK-R1"](AB),
  "TK-R2": C["TK-R2"],
  "TK-R3": C["TK-R3"](AB),
  "TK-R4": C["TK-R4"],
  "TK-R5": C["TK-R5"](NAME),
  "TK-R5b": C["TK-R5b"],
  "TK-R6": C["TK-R6"],
  "TK-R7": C["TK-R7"],
  "TK-R8": C["TK-R8"],
  "TK-D1": C["TK-D1"](NAME),
  "TK-E1": C["TK-E1"](A),
  "TK-D7": C["TK-D7"](NAME),
  "TK-D8": C["TK-D8"](NAME),
  "TK-D9": [C["TK-D9"].text(540), C["TK-D9"].a11y(540)],
  "TK-D10": C["TK-D10"],
  "TK-NC1": C["TK-NC1"](NAME),
  "TK-NC2": C["TK-NC2"](NAME),
  "TK-NC3": C["TK-NC3"](AB),
  "TK-NC4": C["TK-NC4"](AB),
  "TK-NC5": C["TK-NC5"],
  "TK-NC6": C["TK-NC6"](AB),
  "TK-NC7": C["TK-NC7"],
  "TK-ED1": C["TK-ED1"],
  "TK-ED2": C["TK-ED2"](AB),
  "TK-ED3": C["TK-ED3"],
  "TK-ED4": C["TK-ED4"](AB),
  "TK-ED5": C["TK-ED5"](B),
  "TK-ED6": C["TK-ED6"],
  "TK-ED7": C["TK-ED7"],
  "TK-ED8": C["TK-ED8"],
  "TK-RC1": C["TK-RC1"](NAME),
  "TK-RC2": C["TK-RC2"],
  "TK-RC3": C["TK-RC3"](NAME),
  "TK-RC4": C["TK-RC4"],
  "TK-H1": C["TK-H1"],
  "TK-H2": C["TK-H2"](AB),
  "TK-H3": C["TK-H3"],
  "TK-H4": C["TK-H4"],
  "TK-H5": C["TK-H5"],
  "TK-H6": [C["TK-H6"].text, C["TK-H6"].a11y(AB)],
  "TK-H8": C["TK-H8"]("4:35 PM"),
  "TK-H9": C["TK-H9"],
  "TK-E2": C["TK-E2"],
  "TK-E3": C["TK-E3"](B),
  "TK-E4": C["TK-E4"](B),
  "TK-WG1": C["TK-WG1"],
  "TK-WG2": [C["TK-WG2"](1), C["TK-WG2"](2)],
};

/** The deck's words (COPY-DECK.md), one entry per id. */
const DECK: Record<TimekeeperCopyId, unknown> = {
  "TK-AR1": "Accept, then pick a timekeeper together.",
  "TK-AR2": "You'll both pick a timekeeper the moment they accept.",
  "TK-P1": "FACE-OFF · TIMEKEEPER",
  "TK-P2": "Pick a timekeeper",
  "TK-P3": "They start the match, run the clock and record the result. They can't be either of you.",
  "TK-W1": ["CANCELS IN 1:59", "Match cancels in 1 minutes 59 seconds"],
  "TK-P4": "Search friends and nearby",
  "TK-P5": "Friends",
  "TK-P5b": "M. Reyes's friend",
  "TK-P6": "Nearby",
  "TK-P7": ["Ask", "Ask J. Cruz to timekeep"],
  "TK-P8": "Timekeeping another match",
  "TK-P9": "Running their own match",
  "TK-P12": "No friends yet. Nearby athletes can timekeep too.",
  "TK-P13": "Nobody else on the mat right now.",
  "TK-P14": "Nobody to ask yet. Ask someone at your gym to open ELO RATED and go live.",
  "TK-P15": "No one by that name.",
  "TK-P16": { text: "Couldn't load people to ask.", action: "Try again" },
  "TK-P17": "Asked J. Cruz",
  "TK-P18": "Waiting for them to accept.",
  "TK-P19": "Ask someone else",
  "TK-P20": "M. Reyes asked J. Cruz",
  "TK-P21": "J. Cruz can't timekeep. Pick someone else.",
  "TK-P22": "J. Cruz didn't answer. Pick someone else.",
  "TK-P23": "J. Cruz is your timekeeper",
  "TK-W2": { title: "Match cancelled", description: "No timekeeper joined in 10 minutes." },
  "TK-T1": "Timekeep this match?",
  "TK-T2": "You start the match, run the clock and record the result. Your rating isn't affected.",
  "TK-T3": "Accept",
  "TK-T4": "Decline",
  "TK-T5": "ANSWER IN 1:05",
  "TK-T6": "This request is no longer open.",
  "TK-T7": "Timekeepers record the match on video. ELO RATED analyses the film with AI.",
  "TK-T8": "You need to allow recording to timekeep.",
  "TK-F1": "TIMEKEEPER",
  "TK-F2": "CHECKING WEIGHTS",
  "TK-F3": "WEIGHTS CONFIRMED",
  "TK-F4": "Weight looks right, I'm ready",
  "TK-F5": "J. CRUZ STARTS THE MATCH",
  "TK-F6": "J. Cruz starts the match once you're both ready.",
  "TK-F7": "J. Cruz says your weight doesn't look right. Re-weigh to continue.",
  "TK-K0": "FACE-OFF · TIMEKEEPER",
  "TK-K1": "WEIGHING IN",
  "TK-K2": "WEIGHED IN",
  "TK-K3": "NOT READY",
  "TK-K4": "READY",
  "TK-K5": "CONFIRMED",
  "TK-K6": "Start match",
  "TK-K7": "WAITING FOR BOTH ATHLETES",
  "TK-K8": "CONFIRM BOTH WEIGHTS",
  "TK-K9": "Timekeepers always record this match.",
  "TK-K10": "WAITING FOR YOUR CAMERA",
  "TK-K11": "Allow camera access to timekeep. Your camera records the match.",
  "TK-K12": "Open Settings",
  "TK-K14": {
    title: "Stop timekeeping?",
    body: "M. Reyes and D. Okafor will pick a new timekeeper.",
    cancel: "Keep timekeeping",
    confirm: "Leave",
  },
  "TK-K16": {
    title: "Stop timekeeping?",
    body: "The clock is running. If you leave now, the match won't count for either athlete.",
    cancel: "Keep timekeeping",
    confirm: "Leave",
  },
  "TK-K17": "You're no longer timekeeping this match.",
  "TK-L0": "SYNCED TO SERVER CLOCK · ALL PHONES",
  "TK-L1": "YOU RUN THE CLOCK",
  "TK-L2": "J. CRUZ RUNS THE CLOCK",
  "TK-L3": "CAMERA STOPPED · KEEP RUNNING THE CLOCK",
  "TK-L4": "Restart camera",
  "TK-R1": "You're recording for M. Reyes and D. Okafor. They confirm it next.",
  "TK-R2": "Result recorded",
  "TK-R3": "M. Reyes and D. Okafor confirm it next. Your rating isn't affected.",
  "TK-R4": "Done",
  "TK-R5": "RESULT RECORDED BY J. CRUZ",
  "TK-R5b": "RESULT RECORDED BY AN ADMIN",
  "TK-R6": "HOW IT ENDED",
  "TK-R7": "MATCH LENGTH",
  "TK-R8": "Confirm if this is right, or dispute it and an admin will review.",
  "TK-D1": "J. Cruz left. Pick a new timekeeper.",
  "TK-E1": { title: "Match cancelled", description: "M. Reyes left the match." },
  "TK-D7": "J. CRUZ IS OFFLINE",
  "TK-D8": "J. CRUZ DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT",
  "TK-D9": ["NO CONTEST IN 9:00", "Match ends as no contest in 9 minutes 0 seconds"],
  "TK-D10": "Record the result now. Without it, an admin reviews the match.",
  "TK-NC1": { title: "No contest", description: "J. Cruz left the match. It won't count." },
  "TK-NC2": { title: "No contest", description: "J. Cruz went offline. The match won't count." },
  "TK-NC3": { title: "No contest", description: "You left the match. It won't count for M. Reyes or D. Okafor." },
  "TK-NC4": { title: "No contest", description: "An admin voided M. Reyes vs D. Okafor. It won't count." },
  "TK-NC5": { title: "No contest", description: "The match didn't start within 10 minutes. It won't count." },
  "TK-NC6": { title: "No contest", description: "You were offline too long. M. Reyes vs D. Okafor won't count." },
  "TK-NC7": { title: "No contest", description: "The match was paused for over 10 minutes. It won't count." },
  "TK-ED1": "Edit result",
  "TK-ED2": "Fix the result. M. Reyes and D. Okafor confirm it again.",
  "TK-ED3": { text: "Save changes", busy: "Saving..." },
  "TK-ED4": { title: "Result updated", description: "M. Reyes and D. Okafor confirm it again." },
  "TK-ED5": "Editing is closed. D. Okafor disputed the result.",
  "TK-ED6": "Editing is closed. Both athletes confirmed.",
  "TK-ED7": "Couldn't change the result",
  "TK-ED8": "Editing closed 30 minutes after the result. Athletes can still dispute.",
  "TK-RC1": "J. CRUZ CHANGED THE RESULT",
  "TK-RC2": "Check it and confirm again.",
  "TK-RC3": { title: "Result changed", description: "J. Cruz corrected the result. Confirm it again." },
  "TK-RC4": { title: "The result just changed", description: "Check the new result, then confirm." },
  "TK-H1": "TIMEKEEPER",
  "TK-H2": "M. Reyes vs D. Okafor",
  "TK-H3": "You run the clock and record the result.",
  "TK-H4": "The result is waiting on you.",
  "TK-H5": "Back to the match",
  "TK-H6": ["TIMEKEEPING", "Live status: timekeeping M. Reyes vs D. Okafor"],
  "TK-H8": "Result recorded. You can fix it until 4:35 PM.",
  "TK-H9": "Review result",
  "TK-E2": { title: "Couldn't start match", description: "You're timekeeping another match." },
  "TK-E3": { title: "Couldn't start match", description: "D. Okafor is busy in another match." },
  "TK-E4": {
    title: "Cancel match?",
    body: "D. Okafor and your timekeeper go back to the Arena.",
    cancel: "Keep Waiting",
    confirm: "Cancel Match",
  },
  "TK-WG1": "Weight gap: the heavier athlete is favoured.",
  "TK-WG2": [
    "1 weight class apart. The heavier athlete was favoured.",
    "2 weight classes apart. The heavier athlete was favoured.",
  ],
};

/** Every string inside a rendered entry. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

const EM_DASH = String.fromCharCode(0x2014);
const H_BAR = String.fromCharCode(0x2015);

describe("TIMEKEEPER_COPY", () => {
  it("covers exactly the deck ids the app shows", () => {
    expect(Object.keys(C).sort()).toEqual(Object.keys(DECK).sort());
  });

  it.each(Object.keys(DECK) as TimekeeperCopyId[])("%s reads as the deck", (id) => {
    expect(RENDERED[id]).toEqual(DECK[id]);
  });

  it("no string has an em dash, an exclamation mark or an emoji", () => {
    for (const id of Object.keys(RENDERED) as TimekeeperCopyId[]) {
      for (const s of strings(RENDERED[id])) {
        expect([id, s.includes(EM_DASH) || s.includes(H_BAR) || s.includes("!") || /\p{Extended_Pictographic}/u.test(s)]).toEqual([
          id,
          false,
        ]);
      }
    }
  });

  it("leaves out the capture, admin and push strings, and the retired or deferred ids", () => {
    // Capture (M9), admin (M10), pushes (TK-N1 and up: the backend), phase 2, footage nudge.
    for (const family of [/^TK-REC/, /^TK-CAP/, /^TK-AD/, /^TK-N\d/, /^TK-X/, /^TK-U/]) {
      expect(Object.keys(C).filter((id) => family.test(id))).toEqual([]);
    }
    for (const id of ["TK-D2", "TK-D3", "TK-D4", "TK-D5", "TK-D6", "TK-P10", "TK-P11", "TK-P24", "TK-P25", "TK-P26", "TK-P27", "TK-P28"]) {
      expect(Object.keys(C)).not.toContain(id);
    }
  });
});

/**
 * The shared DomainError messages that are deck strings (spec 14.9 X1, M-R4):
 * `@jits/shared` cannot import this module, so its copies are pinned here.
 * Every other timekeeper-mode message is a fallback no timekeeper-mode screen
 * renders (`timekeeper-mode-guard.test.ts`, M-R4).
 */
describe("the shared refusal messages are deck strings", () => {
  const raised = (hint: string) => ({ code: "P0001", hint, message: "raw", details: "" }) as never;

  it("each deck copy in api/timekeeper.ts is the deck's", () => {
    expect(TIMEKEEPER_DECK_MESSAGES).toEqual({
      requestClosed: C["TK-T6"],
      consentRequired: C["TK-T8"],
      editRefused: C["TK-ED7"],
      busyTimekeeping: C["TK-P8"],
      busyCompeting: C["TK-P9"],
      mustRecord: C["TK-K9"],
      resultChanged: C["TK-RC4"].title,
    });
  });

  it.each([
    ["request_closed", C["TK-T6"]],
    ["consent_required", C["TK-T8"]],
    ["edit_window_closed", C["TK-ED7"]],
    ["edit_closed_disputed", C["TK-ED7"]],
    ["edit_closed_confirmed", C["TK-ED7"]],
    ["edit_closed_admin", C["TK-ED7"]],
    ["timekeeper_busy", C["TK-P8"]],
    ["athlete_in_timekeeper_match", C["TK-P9"]],
    ["timekeeper_must_record", C["TK-K9"]],
    ["result_changed", C["TK-RC4"].title],
  ])("a timekeeper-mode refusal %s reads %p", (hint, text) => {
    expect(mapTimekeeperError(raised(hint)).message).toBe(text);
  });

  it("the match INSERT trigger's busy refusals, which any match creation can meet, read the deck's busy words", () => {
    // TK-E2 / TK-E3 need the viewer and the busy athlete (`raw.details`):
    // the Arena chokepoint picks them (slice M6). These are true whoever reads them.
    expect(domainErrorFromHint("timekeeper_busy").message).toBe(C["TK-P8"]);
    expect(domainErrorFromHint("athlete_in_timekeeper_match").message).toBe(C["TK-P9"]);
  });
});

describe("SHIPPED_COPY: shipped strings a timekeeper-mode surface reuses (deck 'Current flow')", () => {
  const APP = join(__dirname, "..", "..", "..");
  const src = (...rel: string[]) => readFileSync(join(APP, ...rel), "utf8");
  const S = SHIPPED_COPY;
  const TOP = src("components", "match-flow", "faceoff", "faceoff-top.tsx");
  const BODY = src("components", "match-flow", "faceoff", "faceoff-body.tsx");
  const CHECK = src("components", "match-flow", "faceoff", "faceoff-weight-check.tsx");
  const START = src("lib", "match-flow", "use-dual-auto-start.ts");
  const ACTIONS = src("lib", "match-flow", "use-weight-check-actions.ts");

  it("holds exactly the shipped words the timekeeper-mode screens reuse", () => {
    expect(Object.keys(S).sort()).toEqual(
      [
        "leave",
        "vs",
        "elo",
        "confirm",
        "flag",
        "youFlagged",
        "withdrawFlag",
        "weighedInAt",
        "reweighedAt",
        "noWeighIn",
        "opponentFlaggedMe",
        "myFlagHold",
        "awaitRecheck",
        "recordFromMyPhone",
        "waitingFor",
        "hold",
        "starting",
        "couldNotStart",
        "matchOnHold",
        "couldNotSaveCheck",
        "weightChanged",
        "resultRecorded",
        "winner",
        "result",
        "draw",
        "won",
        "resultIn",
        "drawValue",
        "noValue",
        "noClock",
        "athleteConfirmed",
        "waiting",
        "disputed",
        "back",
        "couldNotConfirm",
        "checkConnection",
      ].sort(),
    );
  });

  it("A2: the face-off's Leave and its label, the same words as the shipped face-off", () => {
    expect(S.leave).toEqual({ text: "Leave", a11y: "Cancel match" });
    expect(TOP).toContain(`accessibilityLabel="${S.leave.a11y}"`);
    expect(TOP).toMatch(new RegExp(`>\\s*${S.leave.text}\\s*</Text>`));
  });

  it("the crew step takes its Leave from here, with no literal of its own", () => {
    const crew = src("components", "match-flow", "crew", "crew-step.tsx");
    expect(crew).toContain("SHIPPED_COPY.leave.text");
    expect(crew).toContain("SHIPPED_COPY.leave.a11y");
    expect(crew).not.toMatch(/"Cancel match"|>\s*Leave\s*</);
  });

  it("A2: the face-off's VS, the same as the shipped face-off; the asked person's matchup takes it from here", () => {
    expect(S.vs).toBe("VS");
    expect(TOP).toMatch(new RegExp(`>\\s*${S.vs}\\s*</Text>`));
    const matchup = src("components", "match-flow", "crew", "timekeep-matchup.tsx");
    expect(matchup).toContain("SHIPPED_COPY.vs");
    expect(matchup).not.toMatch(/>\s*VS\s*</);
  });

  it("A2-ELO: the Friends row's rating, the same as the shipped Friends row; every picker row takes it from here", () => {
    expect(S.elo(1301)).toBe("1301 ELO");
    expect(src("app", "(app)", "friends.tsx")).toContain("{item.current_elo} ELO</Text>");
    const row = src("components", "match-flow", "crew", "candidate-row.tsx");
    expect(row).toContain("SHIPPED_COPY.elo(");
    expect(row).not.toMatch(/\$\{[^}]+\} ELO|\} ELO</);
  });

  it.each([
    ["confirm", S.confirm, "Confirm", CHECK, 'label="Confirm"'],
    ["flag", S.flag, "Doesn't look right", CHECK, `label="Doesn't look right"`],
    ["youFlagged", S.youFlagged, "YOU FLAGGED", CHECK, '"YOU FLAGGED"'],
    ["withdrawFlag", S.withdrawFlag, "Withdraw flag", CHECK, 'label="Withdraw flag"'],
    ["recordFromMyPhone", S.recordFromMyPhone, "Record from my phone", BODY, "Record from my phone"],
    ["hold", S.hold, "MATCH ON HOLD · WEIGHT CHECK", BODY, '"MATCH ON HOLD · WEIGHT CHECK"'],
    ["starting", S.starting, "STARTING MATCH...", BODY, "STARTING MATCH..."],
    ["couldNotStart", S.couldNotStart, "Couldn't start match", START, `"Couldn't start match"`],
    ["matchOnHold", S.matchOnHold, "Match on hold", START, '"Match on hold"'],
    ["couldNotSaveCheck", S.couldNotSaveCheck, "Couldn't save your check", ACTIONS, `"Couldn't save your check"`],
    ["weightChanged", S.weightChanged, "Weight changed", ACTIONS, '"Weight changed"'],
  ])("A2, B5, B6: %s reads as the shipped face-off source", (_key, value, deck, source, literal) => {
    expect(value).toBe(deck);
    expect(literal).toContain(value);
    expect(source).toContain(literal);
  });

  it("A2, B5: the opponent's weigh-in line, as the shipped check panel builds it", () => {
    expect(CHECK).toContain('const verb = w.opponentReweighed ? "RE-WEIGHED AT" : "WEIGHED IN AT";');
    expect(CHECK).toContain("`${OPP} ${verb} ${lbs(f.opponentWeight)}`");
    expect(CHECK).toContain("`${OPP} HAS NO WEIGH-IN ON RECORD`");
    // The panel's weight and the face-off header's `weightText` (the one the
    // timekeeper-mode screens pass in) write a weight the same way.
    expect(CHECK).toContain("`${Number(w.toFixed(1))} LBS`");
    expect(TOP).toContain('function weightText(lbs: number | null): string {\n  return lbs != null ? `${Number(lbs.toFixed(1))} LBS` : "-- LBS";');
    expect(S.weighedInAt("M. REYES", "167 LBS")).toBe("M. REYES WEIGHED IN AT 167 LBS");
    expect(S.reweighedAt("M. REYES", "167.6 LBS")).toBe("M. REYES RE-WEIGHED AT 167.6 LBS");
    expect(S.noWeighIn("M. REYES")).toBe("M. REYES HAS NO WEIGH-IN ON RECORD");
  });

  it("A2: the weight-check notices and the waiting line", () => {
    expect(CHECK).toContain("`${opp} says your weight doesn't look right. Re-weigh to continue.`");
    expect(CHECK).toContain("`You flagged ${opp}'s weight. Match is on hold.`");
    expect(CHECK).toContain("`Waiting for ${opp} to check your new weight.`");
    expect(BODY).toContain("`WAITING FOR ${oppName}...`");
    expect(S.opponentFlaggedMe(A)).toBe("M. Reyes says your weight doesn't look right. Re-weigh to continue.");
    expect(S.myFlagHold(A)).toBe("You flagged M. Reyes's weight. Match is on hold.");
    expect(S.awaitRecheck(A)).toBe("Waiting for M. Reyes to check your new weight.");
    expect(S.waitingFor("M. REYES")).toBe("WAITING FOR M. REYES...");
  });

  describe("A4: the result and confirm words the timekeeper-mode screens reuse", () => {
    const CONFIRM = src("components", "match-flow", "steps", "confirm-step.tsx");
    const CONFIRM_ADAPTER = src("lib", "match-flow", "confirm-copy.ts");
    const CONFIRM_HOOK = src("lib", "match-flow", "use-confirm-result.ts");
    const DONE = src("components", "match-flow", "steps", "timekeeper-done.tsx");
    const EDIT = src("components", "match-flow", "steps", "result-edit-entry.tsx");
    const FORM = src("components", "match-flow", "steps", "result-form.tsx");
    const WAITING = src("components", "match-flow", "steps", "result-waiting.tsx");
    const DISPUTE = src("components", "match-flow", "steps", "dispute-form.tsx");
    const VERDICT = src("components", "match-flow", "verdict", "verdict-step.tsx");
    /** The plate's function body: the confirm step's other words stay its own. */
    const PLATE = CONFIRM.slice(CONFIRM.indexOf("export function RecordedResultPlate"), CONFIRM.indexOf("export function StatusRow"));

    it.each([
      ["resultRecorded", S.resultRecorded, "RESULT RECORDED", CONFIRM, '"RESULT RECORDED", line: null'],
      ["waiting", S.waiting, "WAITING", CONFIRM, 'CONFIRMED ✓` : "WAITING"'],
      ["disputed", S.disputed, "DISPUTED", VERDICT, 'disputed ? "DISPUTED"'],
      ["back", S.back, "Back", DISPUTE, "\n          Back\n        </Text>"],
      ["drawValue", S.drawValue, "DRAW", CONFIRM, 'return "DRAW";'],
      ["winner", S.winner, "WINNER", FORM, "<Mono color={p.text3}>WINNER</Mono>"],
      ["draw", S.draw, "Draw", FORM, 'label="Draw"'],
      ["noValue", S.noValue, "--", WAITING, ': "--"))'],
      ["noClock", S.noClock, "--:--", WAITING, ': "--:--" }'],
    ])("A4: %s reads as the shipped source", (_key, value, deck, source, literal) => {
      expect(value).toBe(deck);
      expect(literal).toContain(value);
      expect(source).toContain(literal);
    });

    it("A4: the confirm progress row, as the shipped confirm step builds it", () => {
      expect(CONFIRM).toContain("`${oppShort.toUpperCase()} CONFIRMED ✓`");
      expect(S.athleteConfirmed("M. REYES")).toBe("M. REYES CONFIRMED ✓");
    });

    it("A4: the plate's own words (no other shipped screen has them) and the confirm's error toast", () => {
      expect(S.result).toBe("RESULT");
      expect(S.won("M. Reyes")).toBe("M. Reyes won");
      expect(S.resultIn).toBe("Result in");
      expect(S.couldNotConfirm).toBe("Couldn't confirm");
    });

    it("the result plate (confirm step, both modes; the timekeeper's done screen) takes every word from here, through the confirm adapter", () => {
      expect(PLATE.length).toBeGreaterThan(0);
      for (const key of ["winner", "result", "draw", "won", "resultIn", "drawValue", "noValue", "noClock"]) {
        expect([key, CONFIRM_ADAPTER.includes(`${key}: SHIPPED_COPY.${key},`)]).toEqual([key, true]);
      }
      expect(PLATE).toContain("const w = CONFIRM_COPY.plate;");
      expect(PLATE).not.toMatch(/"WINNER"|"RESULT"|"Draw"|"DRAW"|"Result in"|"--"|"--:--"|\bwon`/);
    });

    it("the confirm's error toast takes its title from here in both modes, and timekeeper mode its guidance (PM29), through the confirm adapter", () => {
      expect(CONFIRM_ADAPTER).toContain("couldNotConfirm: SHIPPED_COPY.couldNotConfirm,");
      expect(CONFIRM_ADAPTER).toContain("checkConnection: SHIPPED_COPY.checkConnection,");
      expect(CONFIRM_HOOK).toContain(
        "timekeeperMode ? { text1: CONFIRM_COPY.couldNotConfirm, description: CONFIRM_COPY.checkConnection } : { text1: CONFIRM_COPY.couldNotConfirm, description: res.error.message }",
      );
      expect(CONFIRM_HOOK).not.toContain(`"Couldn't confirm"`);
      expect(CONFIRM_HOOK).not.toContain(`"Check your connection and try again."`);
    });

    it("the timekeeper-mode kicker with no name takes the shipped RESULT RECORDED from here", () => {
      expect(CONFIRM_ADAPTER).toContain("SHIPPED_COPY.resultRecorded");
      expect(CONFIRM_ADAPTER).not.toContain('"RESULT RECORDED"');
    });

    it("the timekeeper's done screen and edit form take their shipped words from here, with no literal of their own", () => {
      expect(DONE).toContain("SHIPPED_COPY.disputed");
      expect(DONE).toContain("SHIPPED_COPY.athleteConfirmed(");
      expect(DONE).toContain("SHIPPED_COPY.waiting");
      expect(DONE).not.toMatch(/"DISPUTED"|CONFIRMED ✓`|"WAITING"/);
      expect(EDIT).toContain("label={SHIPPED_COPY.back}");
      expect(EDIT).not.toMatch(/"Back"/);
    });
  });

  describe("PM29: the guidance under a timekeeper-mode press's failure title (COPY-DECK Round 9)", () => {
    it("is the shipped line, as the Friends row and the booked strip write it", () => {
      expect(S.checkConnection).toBe("Check your connection and try again.");
      expect(src("app", "(app)", "friends.tsx")).toContain(`"${S.checkConnection}"`);
      expect(src("components", "invite", "booked-strip.tsx")).toContain(`"${S.checkConnection}"`);
    });

    it("every timekeeper-mode press takes it from here (directly, or through the confirm or the press adapter), with no literal of its own", () => {
      const direct = [
        ["lib", "match-flow", "use-merged-ready.ts"],
        ["lib", "match-flow", "use-timekeeper-checks.ts"],
        ["lib", "match-flow", "use-timekeeper-start.ts"],
        ["components", "match-flow", "steps", "result-edit-entry.tsx"],
      ];
      // The confirm and result steps (M5): `confirm-copy.ts`.
      const confirmAdapted = [
        ["lib", "match-flow", "use-confirm-result.ts"],
        ["lib", "match-flow", "use-record-result.ts"],
        ["lib", "match-flow", "use-dispute-submit.ts"],
      ];
      // The other shared hooks that branch on timekeeper mode: `press-copy.ts`.
      const pressAdapted = [
        ["lib", "match-flow", "use-weight-check-actions.ts"],
        ["lib", "match-flow", "use-faceoff.ts"],
        ["lib", "match-flow", "use-faceoff-leave.ts"],
        ["lib", "match-flow", "use-live-controls.ts"],
      ];
      // The code, without its comments (which may quote the line).
      const code = (rel: string[]) =>
        src(...rel)
          .split("\n")
          .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
          .join("\n");
      expect(src("lib", "match-flow", "confirm-copy.ts")).toContain("checkConnection: SHIPPED_COPY.checkConnection,");
      expect(src("lib", "match-flow", "press-copy.ts")).toContain("checkConnection: SHIPPED_COPY.checkConnection,");
      for (const rel of direct) {
        const text = code(rel);
        expect([rel.join("/"), text.includes("SHIPPED_COPY.checkConnection"), text.includes(S.checkConnection)]).toEqual([rel.join("/"), true, false]);
      }
      for (const [adapter, files] of [["CONFIRM_COPY", confirmAdapted], ["PRESS_COPY", pressAdapted]] as const) {
        for (const rel of files) {
          const text = code(rel);
          expect([rel.join("/"), text.includes(`${adapter}.checkConnection`), text.includes(S.checkConnection)]).toEqual([rel.join("/"), true, false]);
        }
      }
    });
  });

  it("no string has an em dash, an exclamation mark or an emoji", () => {
    const all = [
      ...strings(S),
      S.weighedInAt("M. REYES", "167 LBS"),
      S.reweighedAt("M. REYES", "167 LBS"),
      S.noWeighIn("M. REYES"),
      S.opponentFlaggedMe(A),
      S.myFlagHold(A),
      S.awaitRecheck(A),
      S.waitingFor("M. REYES"),
      S.elo(1301),
      S.won(A),
      S.athleteConfirmed("M. REYES"),
    ];
    // 27 plain strings and the 10 builders, rendered.
    expect(all).toHaveLength(37);
    for (const s of all) {
      expect([s, s.includes(EM_DASH) || s.includes("!") || /\p{Extended_Pictographic}/u.test(s)]).toEqual([s, false]);
    }
  });
});

describe("formatCountdown", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [65, "1:05"],
    [600, "10:00"],
    [119.9, "1:59"],
    [-4, "0:00"],
    [Number.NaN, "0:00"],
  ])("%p -> %s", (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});
