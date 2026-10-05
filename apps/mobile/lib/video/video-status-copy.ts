/**
 * Every string the match video status surfaces say (jits-n2im.25), in ONE
 * module keyed by relation, state and phase (COPY-DECK v2.2 contradiction
 * rule 2: the same state uses the same string on every surface). The Film
 * status plate, the verdict Film block, the Film Room badge, the upload strip
 * and the match-flow compact line all read from here; a lint test
 * (`video-status-copy.test.ts`) keeps em dashes and exclamation marks out
 * and keeps the surfaces from hard-coding deck strings.
 *
 * Source: design/native-screens/proposals/2026-10-04-video-status/COPY-DECK.md.
 * `{term}` is the in-app noun (owner decision 2026-10-05: "highlight").
 * Tags are sentence case here; the components render them in mono caps.
 */

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** `{term}`: the in-app noun on every screen (deck Variables). */
export const TERM = "highlight";

/** Section 13: the server-elected primary angle. */
export const BEST_ANGLE = "Best angle";

/** Section 4: the plate titles. */
export const PLATE_TITLE = { detail: "Film status", verdict: "Film" } as const;

/** Section 4: phase tags (top right of the plate). */
export const PHASE_TAG = {
  recording: "Recording",
  noVideoYet: "No video yet",
  uploading: "Uploading",
  anySecond: "Any second now",
  waiting: "Waiting",
  building: "Building",
  ready: "Ready",
  filmReady: "Film ready",
  noFilm: "No film",
} as const;

/** `{mm:ss} left` (section 4). */
export function countdownTag(mmss: string): string {
  return `${mmss} left`;
}

/** Section 4a: the competitor's phase lines and helpers. */
export const PHASE_COPY = {
  recordingLine: "Recording. Film uploads after the final whistle.",
  noVideoLine: "No video yet.",
  noVideoHelper: "If someone recorded, it will show up here.",
  collectingOneLine: "Your film is on its way.",
  collectingOneHelper: `Your ${TERM} starts as soon as it's in.`,
  collectingManyLine: (k: number) => `Film is coming in from ${k} phones.`,
  /** Multi-angle claim: only when the server's fusion fields are live. */
  collectingManyHelper: `Your ${TERM} uses every angle that arrives.`,
  collectingWindowHelper: (filmUntil: string) => `If nothing arrives by ${filmUntil}, we'll let you know there's no film.`,
  /** `angle` is an angle reference: "D. Okafor's angle" or "your angle". */
  waitOneLine: (angle: string) => `Waiting up to 10 min for ${angle}.`,
  waitManyLine: (p: number) => `Waiting up to 10 min for ${p} more angles.`,
  waitOneHelper: `Your ${TERM} uses it if it arrives. If not, we build it from what's in.`,
  waitManyHelper: `Your ${TERM} uses them if they arrive. If not, we build it from what's in.`,
  waitExtendedLine: (angle: string) => `${capitalize(angle)} is in. Giving it up to 10 more min.`,
  waitExtendedHelper: `It's being processed so your ${TERM} can use it.`,
  buildingLine: `Building your ${TERM}.`,
  buildingFromLine: (n: number) => `Building your ${TERM} from ${n} angles.`,
  buildingFromYourAngle: `Building your ${TERM} from your angle.`,
  buildingFromNamedAngle: (name: string) => `Building your ${TERM} from ${name}'s angle.`,
  buildingHelper: "Usually 1 to 3 minutes. We'll let you know.",
  lateAngleHelper: (angle: string) => `If ${angle} arrives in the next 24 hours, we'll add it.`,
  readyLine: `Film and ${TERM} ready.`,
  readyLateAddedHelper: (angle: string) => `${capitalize(angle)} came in later. Your ${TERM} was updated with it.`,
  filmOnlyLine: "Film ready to watch.",
  noClearMomentHelper: `We couldn't find a clear ${TERM} of you in this video.`,
  reelFailedHelper: `We couldn't make your ${TERM}.`,
  noFilmLine: "No film for this match.",
  nobodyRecordedHelper: "No one recorded it. Turn on Record from my phone at the face-off next time.",
  noneUsableHelper: "None of the video could be used. Your result and rating aren't affected.",
  windowClosedHelper: "None of the video came in. Your result and rating aren't affected.",
  cancelledHelper: "This match was cancelled. Nothing will upload.",
} as const;

/** Section 4b: the timekeeper's phase lines and helpers (record only). */
export const TIMEKEEPER_PHASE_COPY = {
  recordingLine: "You're recording this match as timekeeper.",
  recordingHelper: "Recording stops at the final whistle.",
  collectingLine: "Film is coming in.",
  waitHelper: `The players' ${TERM}s use every angle that arrives in time.`,
  buildingFromLine: (n: number) => `Building the players' ${TERM}s from ${n} angles.`,
  /** Derived (deck 14): one angle, or no fusion count yet; drops the "from" clause like 4a. */
  buildingLine: `Building the players' ${TERM}s.`,
  readyLine: "Film ready. Thanks for recording.",
  noFilmHelper: "None of the video could be used.",
} as const;

/** Section 2: angle labels and the row tags. */
export const ANGLE_LABEL = {
  mine: "Your angle",
  named: (name: string) => `${name}'s angle`,
  /** Mid-sentence reference to the viewer's own angle. */
  mineRef: "your angle",
  /** A nameless other angle (never expected: the server always names it). */
  fallback: "Their angle",
  timekeeperTag: "Timekeeper",
} as const;

export const ROW_TAG = {
  notUploaded: "Not uploaded",
  uploading: "Uploading",
  paused: "Paused",
  didntUpload: "Didn't upload",
  processing: "Processing",
  /** Bytes in, analysis running: it plays (wave 2 tag). */
  analyzing: "Analyzing",
  ready: "Ready to watch",
  /** A pipeline failure on a file that still plays (wave 2 tag). */
  analysisFailed: "Analysis failed · may still play",
  notUsed: "Not used",
  waitingYourPhone: "Waiting for your phone",
  waitingTheirPhone: "Waiting for their phone",
  notInTerm: `Not in your ${TERM}`,
} as const;

/** Section 2: row helpers by relation and state. */
export const ROW_HELPER = {
  // 2a, this phone's own job.
  uploadDidntFinish: "The upload didn't finish.",
  clipGone: "The clip isn't on this phone anymore.",
  noMatchMine: "We couldn't see a match in this clip.",
  mineFailedUsesOther: (name: string) => `Your ${TERM} uses ${name}'s angle.`,
  mineFailedNothing: "Something went wrong on our side. Nothing for you to do.",
  timekeeperFailed: "Thanks for recording. The players' angles are still used.",
  // 2b, the viewer's own angle on another device.
  openToStart: "Open ELO RATED on the phone that recorded to start the upload.",
  openToFinish: "Open ELO RATED on the phone that recorded to finish the upload.",
  didntFinishThere: "The upload didn't finish on the phone that recorded.",
  // 2c / 2d, someone else's angle.
  theirPhone: (name: string) => `It uploads when ELO RATED is open on ${name}'s phone.`,
  quiet: (name: string) => `We haven't heard from ${name}'s phone for a few minutes. It picks up where it left off.`,
  addUntil: (until: string) => `It can still be added to your ${TERM} until ${until}.`,
  addIfInBy: (until: string) => `If it's in by ${until}, we'll add it to your ${TERM}.`,
  stillWatchable: "It will still be watchable if it uploads.",
  noMatchOther: "No match was found in this clip.",
  otherFailed: "This clip couldn't be processed.",
  usesYourAngle: `Your ${TERM} uses your angle.`,
  usesOtherAngles: `Your ${TERM} uses the other angles.`,
  // 2e, the timekeeper (no {term} of their own).
  timekeeperAddUntil: (until: string) => `It can still be added until ${until}.`,
} as const;

/** Section 3: the app-wide upload strip. */
export const STRIP_COPY = {
  uploading: "Uploading match video",
  uploadingMany: (n: number) => `Uploading ${n} match videos`,
  paused: "Upload paused",
  failed: "Didn't upload",
  uploaded: "Match video uploaded",
  details: "Details",
  a11yUploading: (label: string, pct: number | null) => (pct != null ? `${label}, ${pct} percent. Opens the match.` : `${label}. Opens the match.`),
  a11yPaused: "Upload paused. Opens the match.",
  a11yFailed: "Your match video didn't upload. Opens the match.",
  a11yTerminal: (helper: string) => `Your match video didn't upload. ${helper} Details.`,
  a11yUploaded: "Match video uploaded.",
} as const;

/** Section 3: the compact line under the End, Result and Confirm steps. */
export const COMPACT_COPY = {
  preparing: "Your angle: preparing upload",
  uploading: "Your angle: uploading",
  paused: "Your angle: paused",
  failed: "Your angle: didn't upload",
  /** Grey: the same words, nothing to do. */
  terminal: "Your angle: didn't upload",
  uploaded: "Your angle: uploaded",
} as const;

/** The verdict hero's still caption while the status says there is no film (yet). */
export const HERO_CAPTION = {
  noFilm: "NO FILM FOR THIS MATCH",
  noVideoYet: "NO VIDEO YET",
} as const;

/** Film Room card centre captions the status adds (the rest are the card's own). */
export const CARD_CAPTION = {
  arrivesAfterUpload: "STILL ARRIVES AFTER UPLOAD",
} as const;

/** Section 9: Film Room badges (one badge; the whole string renders uppercase, m2). */
export const CARD_BADGE = {
  waiting: (mmss: string) => `WAITING ${mmss}`,
  building: `BUILDING ${TERM.toUpperCase()}`,
  uploading: "UPLOADING",
  noFilm: "NO FILM",
} as const;

/**
 * Section 10.1: what a screen reader hears when a row's state changes
 * ("D. Okafor's angle is ready to watch.").
 */
const ROW_ANNOUNCE: Record<string, string> = {
  [ROW_TAG.notUploaded]: "isn't uploaded",
  [ROW_TAG.uploading]: "is uploading",
  [ROW_TAG.paused]: "is paused",
  [ROW_TAG.didntUpload]: "didn't upload",
  [ROW_TAG.processing]: "is processing",
  [ROW_TAG.analyzing]: "is being analyzed",
  [ROW_TAG.analysisFailed]: "couldn't be analyzed but may still play",
  [ROW_TAG.ready]: "is ready to watch",
  [ROW_TAG.notUsed]: "wasn't used",
  [ROW_TAG.waitingYourPhone]: "is waiting for your phone",
  [ROW_TAG.waitingTheirPhone]: "is waiting for their phone",
  [ROW_TAG.notInTerm]: `isn't in your ${TERM}`,
};

export function rowAnnouncement(label: string, tag: string): string {
  return `${label} ${ROW_ANNOUNCE[tag] ?? tag.toLowerCase()}.`;
}

/** Section 10.3: the countdown's spoken form. */
export function countdownA11y(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = `${m} ${m === 1 ? "minute" : "minutes"}`;
  const sec = `${r} ${r === 1 ? "second" : "seconds"}`;
  if (m === 0) return `${sec} left`;
  return r === 0 ? `${min} left` : `${min} ${sec} left`;
}

/** `8:12` for a remaining time in ms (ceil: 0:01 shows until the deadline). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function strings(obj: Record<string, unknown>): string[] {
  return Object.values(obj).filter((v): v is string => typeof v === "string");
}

/** Every string constant in this module, for the lint test. */
export const ALL_STATIC_COPY: readonly string[] = [
  BEST_ANGLE,
  ...[PLATE_TITLE, PHASE_TAG, PHASE_COPY, TIMEKEEPER_PHASE_COPY, ANGLE_LABEL, ROW_TAG, ROW_HELPER, STRIP_COPY, COMPACT_COPY, HERO_CAPTION, CARD_CAPTION, CARD_BADGE].flatMap(strings),
];
