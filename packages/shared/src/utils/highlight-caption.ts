import type { HighlightCaptionContext } from "../api/highlight-share";

/**
 * Suggested Instagram caption and collaborator tip for a highlight reel
 * (jr_be spec 014 section 16.5). Pure. Display names only: no handles, no
 * URLs (handle collection is a fast follow).
 */

/** Hard cap on the caption. Instagram allows 2,200; ours stays short. */
export const HIGHLIGHT_CAPTION_MAX = 400;

const HASHTAGS = "#bjj #jiujitsu #brazilianjiujitsu #elorated";
const TRACKED = "Tracked on ELO RATED.";

function cleanName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed : null;
}

/** Trimmed, whitespace-collapsed, lower-cased except for its first letter. */
function cleanTechnique(technique: string | null | undefined): string | null {
  const collapsed = (technique ?? "").trim().replace(/\s+/g, " ");
  if (!collapsed) return null;
  return collapsed.charAt(0) + collapsed.slice(1).toLowerCase();
}

function firstLine(ctx: HighlightCaptionContext): string {
  const opponent = cleanName(ctx.opponentName);
  const against = opponent ? `against ${opponent}` : "today";
  const withOpp = opponent ? `with ${opponent}` : "today";
  switch (ctx.outcome) {
    case "win": {
      const technique = cleanTechnique(ctx.technique);
      return technique ? `Got the ${technique} ${against}.` : `Took the win ${against}.`;
    }
    case "draw":
      return `Went the distance ${withOpp}.`;
    case "loss":
      return `Rolled ${withOpp}. Learning every round.`;
    default:
      return `On the mats ${withOpp}.`;
  }
}

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function secondLine(ctx: HighlightCaptionContext): string {
  if (ctx.matchType !== "ranked") return "Casual roll.";
  if (ctx.eloAfter === null || !Number.isFinite(ctx.eloAfter)) return "Ranked match.";
  const after = Math.round(ctx.eloAfter);
  const delta = ctx.eloDelta === null || !Number.isFinite(ctx.eloDelta) ? 0 : Math.round(ctx.eloDelta);
  return delta === 0
    ? `Ranked match. Now ${after} ELO.`
    : `Ranked match. Now ${after} ELO (${signed(delta)}).`;
}

/**
 * Four lines joined by `\n`: what happened, the match type (and ELO when
 * ranked), "Tracked on ELO RATED.", the hashtags. Never longer than
 * HIGHLIGHT_CAPTION_MAX: an over-long first line (a very long name or
 * technique) is cut with an ellipsis, the other lines are fixed.
 */
export function buildHighlightCaption(ctx: HighlightCaptionContext): string {
  const tail = [secondLine(ctx), TRACKED, HASHTAGS].join("\n");
  const budget = HIGHLIGHT_CAPTION_MAX - tail.length - 1;
  let line1 = firstLine(ctx);
  if (line1.length > budget) line1 = `${line1.slice(0, budget - 1).trimEnd()}…`;
  return `${line1}\n${tail}`;
}

/** Instagram's collaborator invite, which puts one post on both profiles. */
export function buildCollabTip(opponentName: string | null): string {
  const who = cleanName(opponentName) ?? "your opponent";
  return `Tag ${who} as a collaborator: in Instagram tap Tag people, then Invite collaborator. One post shows on both profiles.`;
}
