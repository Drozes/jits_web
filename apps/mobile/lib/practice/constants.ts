/**
 * Practice match (jr_be spec 014): a client-side walk through one Arena
 * match against a scripted bot. Nothing here touches match data; the only
 * network write is `markPracticeMatch`.
 */
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";

/** How long the bot "thinks" before accepting, readying and confirming. */
export const BOT_ACCEPT_MS = 1500;
export const BOT_READY_MS = 1500;
export const BOT_CONFIRM_MS = 1500;

/** Practice clock. End Match works at any time. */
export const PRACTICE_DURATION_SECONDS = 30;

/** Recorder key. Never a real match id, and the recorder never uploads it. */
export const PRACTICE_RECORDER_ID = "practice";

export const PRACTICE_BOT_ID = "practice-bot";
export const PRACTICE_BOT_NAME = "Practice Partner";

/**
 * The bot as an Arena roster row. Same weight as the user; the row shows
 * "No rating" instead of a number, so nothing suggests stakes.
 */
export function practiceBot(athlete: {
  current_elo: number;
  current_weight: number | null;
}): ArenaCompetitor {
  return {
    id: PRACTICE_BOT_ID,
    displayName: PRACTICE_BOT_NAME,
    currentElo: athlete.current_elo,
    eloDiff: 0,
    weight: athlete.current_weight ?? undefined,
    gymName: "Practice bot",
    profilePhotoUrl: null,
    acceptsRanked: true,
  };
}

export type PracticePhase =
  | "offline"
  | "lobby"
  | "waiting"
  | "weight"
  | "ready"
  | "live"
  | "end"
  | "result"
  | "confirm"
  | "summary";

/** One coach line per phase, 20 words or fewer. `end` is too brief for one. */
export const PRACTICE_TIPS: Record<PracticePhase, string | null> = {
  offline: "In the Arena, go live so athletes on the mat can see you.",
  lobby: "Challenge someone who is on the mat with you. Tap Challenge on your practice partner.",
  waiting: "Challenge sent. In a real match your opponent gets a prompt and taps Accept.",
  weight: "Check both weights are right. Big weight gaps are factored into real ratings.",
  ready: "Prop your phone so the whole mat is in frame. This practice clip never leaves your phone.",
  live: "No need to actually roll. Either of you can pause. Tap End Match when someone taps.",
  end: null,
  result:
    "Record how it ended: a submission and winner, or a draw. Real Arena matches are ranked; practice is not.",
  confirm:
    "Your opponent confirms the result. In a real match you can dispute a wrong result here.",
  summary: null,
};

export const PRACTICE_SUMMARY_TIP_CLIP =
  "Real match clips upload to the match for review. This one stays on your phone, deleted when you leave.";
/** No clip because the camera was not allowed. */
export const PRACTICE_SUMMARY_TIP_NO_CLIP =
  "No clip this time. Allow camera access before your first real match; real clips upload to the match for review.";
/** Camera allowed, but no clip came out (for example, the run was too short). */
export const PRACTICE_SUMMARY_TIP_NO_CLIP_GRANTED =
  "No clip this time. Real match clips upload to the match for review.";

export const PRACTICE_LOBBY_BODY = "Practice lobby. Only your practice partner is here.";

export const PRACTICE_OFFER_TITLE = "Try a practice match";
export const PRACTICE_OFFER_BODY =
  "Walk through a real Arena match against a practice bot. No rating, nobody else sees it, about a minute.";

/**
 * Whether Home offers the practice match. Only once (`offered_at` is set as
 * soon as the athlete answers), never to a bot, never over a match in
 * flight, and only to an athlete with no completed matches, so existing
 * athletes are not nagged. `statsLoaded` keeps the card from flashing for an
 * experienced athlete before the dashboard summary arrives.
 */
export function shouldOfferPracticeMatch(input: {
  athlete: { practice_match_offered_at: string | null; is_bot: boolean };
  hasActiveMatch: boolean;
  statsLoaded: boolean;
  hasMatches: boolean;
}): boolean {
  const { athlete, hasActiveMatch, statsLoaded, hasMatches } = input;
  return (
    athlete.practice_match_offered_at == null &&
    !athlete.is_bot &&
    !hasActiveMatch &&
    statsLoaded &&
    !hasMatches
  );
}
