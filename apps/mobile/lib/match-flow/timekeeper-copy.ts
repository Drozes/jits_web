/**
 * Every timekeeper-mode string the app shows, keyed by its copy deck id
 * (`design/native-screens/proposals/2026-10-15-timekeeper/COPY-DECK.md`,
 * Rounds 1 to 8; timekeeper mode spec 12; clean-code rule M-R4). Screens take
 * their words from here and nowhere else; a missing string goes to the deck
 * first.
 *
 * Not here: the capture strings (TK-REC*, TK-CAP1: M9's
 * `lib/video/capture-copy.ts`), the Admin > Timekeeper reviews strings
 * (TK-AD*: M10's screen module), the pushes (TK-N*: written by the backend's
 * push function), and the retired or deferred ids (TK-D2 to TK-D6, TK-P10,
 * TK-P11, TK-P24 to TK-P28, TK-U1, TK-U2, TK-X*).
 *
 * Placeholders, as the deck names them: `a` and `b` are the athletes' short
 * names (challenger first), `name` the timekeeper's short name (upper-cased
 * here where the deck writes `{NAME}`), `athlete` the athlete who acted,
 * `opponent` the other athlete. Countdowns take whole seconds and print
 * `m:ss`. No string has an em dash, an exclamation mark or an emoji.
 */

/** The athletes' short names, challenger first. */
export interface AthletePair {
  a: string;
  b: string;
}

/** A toast: title plus description. */
export interface TimekeeperToast {
  title: string;
  description: string;
}

/** A confirmation alert: title, body, the safe button and the action. */
export interface TimekeeperAlert {
  title: string;
  body: string;
  cancel: string;
  confirm: string;
}

/** `m:ss` for a countdown (negative clamps to 0:00). */
export function formatCountdown(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "{m} minutes {s} seconds", the spoken form of `formatCountdown`. */
function spokenCountdown(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)} minutes ${total % 60} seconds`;
}

const up = (s: string) => s.toUpperCase();

/** Shipped toast and alert titles the timekeeper-mode toasts reuse (deck "Current flow", A2). */
const MATCH_CANCELLED = "Match cancelled";
const COULD_NOT_START = "Couldn't start match";
const NO_CONTEST = "No contest";

export const TIMEKEEPER_COPY = {
  // Arena (B1), shown only while the flag is known ON.
  "TK-AR1": "Accept, then pick a timekeeper together.",
  "TK-AR2": "You'll both pick a timekeeper the moment they accept.",

  // Picker (B2, B3).
  "TK-P1": "FACE-OFF · TIMEKEEPER",
  "TK-P2": "Pick a timekeeper",
  "TK-P3": "They start the match, run the clock and record the result. They can't be either of you.",
  "TK-W1": {
    text: (seconds: number) => `CANCELS IN ${formatCountdown(seconds)}`,
    a11y: (seconds: number) => `Match cancels in ${spokenCountdown(seconds)}`,
  },
  "TK-P4": "Search friends and nearby",
  "TK-P5": "Friends",
  "TK-P5b": (athlete: string) => `${athlete}'s friend`,
  "TK-P6": "Nearby",
  "TK-P7": { text: "Ask", a11y: (name: string) => `Ask ${name} to timekeep` },
  "TK-P8": "Timekeeping another match",
  "TK-P9": "Running their own match",
  "TK-P12": "No friends yet. Nearby athletes can timekeep too.",
  "TK-P13": "Nobody else on the mat right now.",
  "TK-P14": "Nobody to ask yet. Ask someone at your gym to open ELO RATED and go live.",
  "TK-P15": "No one by that name.",
  "TK-P16": { text: "Couldn't load people to ask.", action: "Try again" },
  "TK-P17": (name: string) => `Asked ${name}`,
  "TK-P18": "Waiting for them to accept.",
  "TK-P19": "Ask someone else",
  "TK-P20": (p: { athlete: string; name: string }) => `${p.athlete} asked ${p.name}`,
  "TK-P21": (name: string) => `${name} can't timekeep. Pick someone else.`,
  "TK-P22": (name: string) => `${name} didn't answer. Pick someone else.`,
  "TK-P23": (name: string) => `${name} is your timekeeper`,
  "TK-W2": { title: MATCH_CANCELLED, description: "No timekeeper joined in 10 minutes." } as TimekeeperToast,

  // The asked person (B4).
  "TK-T1": "Timekeep this match?",
  "TK-T2": "You start the match, run the clock and record the result. Your rating isn't affected.",
  "TK-T3": "Accept",
  "TK-T4": "Decline",
  "TK-T5": (seconds: number) => `ANSWER IN ${formatCountdown(seconds)}`,
  "TK-T6": "This request is no longer open.",
  "TK-T7": "Timekeepers record the match on video. ELO RATED analyses the film with AI.",
  "TK-T8": "You need to allow recording to timekeep.",

  // Athlete face-off (B5).
  "TK-F1": "TIMEKEEPER",
  "TK-F2": "CHECKING WEIGHTS",
  "TK-F3": "WEIGHTS CONFIRMED",
  "TK-F4": "Weight looks right, I'm ready",
  "TK-F5": (name: string) => `${up(name)} STARTS THE MATCH`,
  "TK-F6": (name: string) => `${name} starts the match once you're both ready.`,
  "TK-F7": (name: string) => `${name} says your weight doesn't look right. Re-weigh to continue.`,

  // Timekeeper face-off (B6).
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
  /** Before the start only (Round 4). */
  "TK-K14": (p: AthletePair): TimekeeperAlert => ({
    title: "Stop timekeeping?",
    body: `${p.a} and ${p.b} will pick a new timekeeper.`,
    cancel: "Keep timekeeping",
    confirm: "Leave",
  }),
  /** While the clock runs (Round 4). */
  "TK-K16": {
    title: "Stop timekeeping?",
    body: "The clock is running. If you leave now, the match won't count for either athlete.",
    cancel: "Keep timekeeping",
    confirm: "Leave",
  } as TimekeeperAlert,
  "TK-K17": "You're no longer timekeeping this match.",
  "TK-L0": "SYNCED TO SERVER CLOCK · ALL PHONES",

  // Live (B7).
  "TK-L1": "YOU RUN THE CLOCK",
  "TK-L2": (name: string) => `${up(name)} RUNS THE CLOCK`,
  "TK-L3": "CAMERA STOPPED · KEEP RUNNING THE CLOCK",
  "TK-L4": "Restart camera",

  // Result, confirm, done (B8; Rounds 4, 6, 7).
  "TK-R1": (p: AthletePair) => `You're recording for ${p.a} and ${p.b}. They confirm it next.`,
  "TK-R2": "Result recorded",
  "TK-R3": (p: AthletePair) => `${p.a} and ${p.b} confirm it next. Your rating isn't affected.`,
  "TK-R4": "Done",
  "TK-R5": (name: string) => `RESULT RECORDED BY ${up(name)}`,
  "TK-R5b": "RESULT RECORDED BY AN ADMIN",
  "TK-R6": "HOW IT ENDED",
  "TK-R7": "MATCH LENGTH",
  /** The confirm helper in BOTH modes (A25). */
  "TK-R8": "Confirm if this is right, or dispute it and an admin will review.",

  // Drop-out, offline, review (B9; Round 4).
  "TK-D1": (name: string) => `${name} left. Pick a new timekeeper.`,
  "TK-E1": (athlete: string): TimekeeperToast => ({ title: MATCH_CANCELLED, description: `${athlete} left the match.` }),
  "TK-D7": (name: string) => `${up(name)} IS OFFLINE`,
  "TK-D8": (name: string) => `${up(name)} DIDN'T RECORD THE RESULT · AN ADMIN WILL REVIEW IT`,
  "TK-D9": {
    text: (seconds: number) => `NO CONTEST IN ${formatCountdown(seconds)}`,
    a11y: (seconds: number) => `Match ends as no contest in ${spokenCountdown(seconds)}`,
  },
  "TK-D10": "Record the result now. Without it, an admin reviews the match.",

  // No contest exits (Rounds 4, 5).
  "TK-NC1": (name: string): TimekeeperToast => ({ title: NO_CONTEST, description: `${name} left the match. It won't count.` }),
  "TK-NC2": (name: string): TimekeeperToast => ({
    title: NO_CONTEST,
    description: `${name} went offline. The match won't count.`,
  }),
  "TK-NC3": (p: AthletePair): TimekeeperToast => ({
    title: NO_CONTEST,
    description: `You left the match. It won't count for ${p.a} or ${p.b}.`,
  }),
  "TK-NC4": (p: AthletePair): TimekeeperToast => ({
    title: NO_CONTEST,
    description: `An admin voided ${p.a} vs ${p.b}. It won't count.`,
  }),
  "TK-NC5": {
    title: NO_CONTEST,
    description: "The match didn't start within 10 minutes. It won't count.",
  } as TimekeeperToast,
  "TK-NC6": (p: AthletePair): TimekeeperToast => ({
    title: NO_CONTEST,
    description: `You were offline too long. ${p.a} vs ${p.b} won't count.`,
  }),
  "TK-NC7": {
    title: NO_CONTEST,
    description: "The match was paused for over 10 minutes. It won't count.",
  } as TimekeeperToast,

  // Result edit, timekeeper (Rounds 4, 5).
  "TK-ED1": "Edit result",
  "TK-ED2": (p: AthletePair) => `Fix the result. ${p.a} and ${p.b} confirm it again.`,
  "TK-ED3": { text: "Save changes", busy: "Saving..." },
  "TK-ED4": (p: AthletePair): TimekeeperToast => ({
    title: "Result updated",
    description: `${p.a} and ${p.b} confirm it again.`,
  }),
  "TK-ED5": (athlete: string) => `Editing is closed. ${athlete} disputed the result.`,
  "TK-ED6": "Editing is closed. Both athletes confirmed.",
  "TK-ED7": "Couldn't change the result",
  "TK-ED8": "Editing closed 30 minutes after the result. Athletes can still dispute.",

  // Re-confirm, athletes (Round 4).
  "TK-RC1": (name: string) => `${up(name)} CHANGED THE RESULT`,
  "TK-RC2": "Check it and confirm again.",
  "TK-RC3": (name: string): TimekeeperToast => ({
    title: "Result changed",
    description: `${name} corrected the result. Confirm it again.`,
  }),
  "TK-RC4": { title: "The result just changed", description: "Check the new result, then confirm." } as TimekeeperToast,

  // The timekeeper on Home and the header (A20, A24).
  "TK-H1": "TIMEKEEPER",
  "TK-H2": (p: AthletePair) => `${p.a} vs ${p.b}`,
  "TK-H3": "You run the clock and record the result.",
  "TK-H4": "The result is waiting on you.",
  "TK-H5": "Back to the match",
  "TK-H6": { text: "TIMEKEEPING", a11y: (p: AthletePair) => `Live status: timekeeping ${p.a} vs ${p.b}` },
  /** `time` in the device's short local time, for example `4:35 PM`. */
  "TK-H8": (time: string) => `Result recorded. You can fix it until ${time}.`,
  "TK-H9": "Review result",

  // Busy and Leave (R2; Round 5).
  "TK-E2": { title: COULD_NOT_START, description: "You're timekeeping another match." } as TimekeeperToast,
  "TK-E3": (athlete: string): TimekeeperToast => ({
    title: COULD_NOT_START,
    description: `${athlete} is busy in another match.`,
  }),
  /** The athlete Leave alert once a timekeeper is seated (while picking, the shipped alert stays). */
  "TK-E4": (opponent: string): TimekeeperAlert => ({
    title: "Cancel match?",
    body: `${opponent} and your timekeeper go back to the Arena.`,
    cancel: "Keep Waiting",
    confirm: "Cancel Match",
  }),

  // Weight notes without points, BOTH modes (A28, Round 8).
  "TK-WG1": "Weight gap: the heavier athlete is favoured.",
  "TK-WG2": (classes: number) =>
    `${classes} weight class${classes === 1 ? "" : "es"} apart. The heavier athlete was favoured.`,
} as const;

export type TimekeeperCopyId = keyof typeof TIMEKEEPER_COPY;

/**
 * Shipped strings a timekeeper-mode surface reuses unchanged, as the deck's
 * "Current flow" boards list them (COPY-DECK.md, A2). The shipped screen keeps
 * its own literal; `timekeeper-copy.test.ts` pins each entry to that shipped
 * source, so the two copies cannot drift.
 */
export const SHIPPED_COPY = {
  /** A2: the face-off's Leave (`faceoff/faceoff-top.tsx`), also the crew step's: it cancels the match for both athletes. */
  leave: { text: "Leave", a11y: "Cancel match" },
} as const;
