import type { HighlightCaptionContext } from "../api/highlight-share";

/**
 * Suggested Instagram caption and collaborator tip for a highlight reel
 * (jr_be spec 015 section 16.5). Pure. Display names only: no handles, no
 * URLs (handle collection is a fast follow).
 */

/** Hard cap on the caption. Instagram allows 2,200; ours stays short. */
export const HIGHLIGHT_CAPTION_MAX = 400;

const HASHTAGS = "#bjj #jiujitsu #brazilianjiujitsu #elorated";
const TRACKED = "Tracked on ELO RATED.";

/** C0/C1 controls (tabs, newlines included): read as a word break. */
const CONTROLS = /[\u0000-\u001F\u007F-\u009F]/g;
/** Bidi embeddings/overrides/isolates/marks, zero-width characters and the BOM: removed outright. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** An unmistakable link: a scheme (`x://`) or a `www.` prefix. The whole token is dropped. */
const EXPLICIT_LINK = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i;
/** A bare domain-looking core (anything ending in a 2+ letter TLD, plus a path): its dots become spaces. */
const DOMAIN_LIKE = /^\S+\.[a-z]{2,}(?:[/?#]\S*)?$/i;
/** Full-width / ideographic dots, read as "." for the link check ("evil。com"). */
const WIDE_DOTS = /[\u3002\uFF0E\uFF61]/g;
/** Punctuation around a token (quotes, brackets, sentence marks), not part of it. */
const LEADING_PUNCT = /^["'\u201C\u201D\u2018\u2019([{<\u00AB\u00A1\u00BF]+/;
const TRAILING_PUNCT = /["'\u201C\u201D\u2018\u2019)\]}>\u00BB,.;:!?\u2026\u3002\uFF0E\uFF61]+$/;
const HANDLE_MARKS = /^[@#\uFF20\uFF03]+/;

/**
 * One token, or null to drop it. Surrounding punctuation is split off first,
 * so "(evil.com)", "evil.com." and "\"@handle\"" are judged by their core.
 * A leading @ / # is removed from the core (no handles or hashtags injected
 * through a name). A core with a scheme or `www.` is dropped outright; any
 * other domain-looking core keeps its words but loses its dots ("Ana.Souza"
 * -> "Ana Souza", "evil.com" -> "evil com"), so it can never render as a
 * link and a dotted name survives. Punctuation around a surviving core is
 * kept, so "J." stays "J." (a single letter is no TLD).
 */
function cleanToken(token: string): string | null {
  const lead = token.match(LEADING_PUNCT)?.[0] ?? "";
  const rest = token.slice(lead.length);
  const trail = rest.match(TRAILING_PUNCT)?.[0] ?? "";
  const core = rest.slice(0, rest.length - trail.length);
  if (!core) return null;
  const unmarked = core.replace(HANDLE_MARKS, "");
  if (!unmarked) return null;
  const normalised = unmarked.replace(WIDE_DOTS, ".");
  if (EXPLICIT_LINK.test(normalised)) return null;
  const body = DOMAIN_LIKE.test(normalised)
    ? normalised.replace(/\.+/g, " ").trim().replace(/\s+/g, " ")
    : unmarked;
  return body ? `${lead}${body}${trail}` : null;
}

/**
 * Free text from the database made safe for a caption: invisible and
 * direction-changing characters removed, explicit links dropped and bare
 * domains de-dotted, leading
 * `@` / `#` stripped from every word (no handles, no hashtags injected
 * through a name), whitespace collapsed. Null when nothing is left.
 */
export function sanitiseCaptionText(text: string | null | undefined): string | null {
  const words = (text ?? "")
    .replace(CONTROLS, " ")
    .replace(INVISIBLE, "")
    .split(/\s+/)
    .filter(Boolean)
    .map(cleanToken)
    .filter((word): word is string => !!word);
  const cleaned = words.join(" ").trim();
  return cleaned ? cleaned : null;
}

function cleanName(name: string | null | undefined): string | null {
  return sanitiseCaptionText(name);
}

/** Cut `text` to at most `max` UTF-16 units plus "…", never inside a surrogate pair. */
function cutWithEllipsis(text: string, max: number): string {
  let out = "";
  for (const ch of [...text]) {
    if (out.length + ch.length > max - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

function firstLine(ctx: HighlightCaptionContext): string {
  const opponent = cleanName(ctx.opponentName);
  const against = opponent ? `against ${opponent}` : "today";
  const withOpp = opponent ? `with ${opponent}` : "today";
  switch (ctx.outcome) {
    case "win":
      // `ctx.technique` is the highlight planner's AI guess at the finish
      // (jr_be `_highlight_match_facts`), not the recorded submission. AI
      // move names are hidden from every athlete for now (owner decision
      // 2026-10-06, jits-xfvd.18), so the win line never names it.
      return `Took the win ${against}.`;
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

/**
 * Every match is the same kind (casual was retired, jr_be-ahn.1), so the line
 * names no match type: the new ELO when the server recorded it, else null
 * (no line at all). A legacy casual reel reads like any match.
 */
function secondLine(ctx: HighlightCaptionContext): string | null {
  if (ctx.eloAfter === null || !Number.isFinite(ctx.eloAfter)) return null;
  const after = Math.round(ctx.eloAfter);
  const delta = ctx.eloDelta === null || !Number.isFinite(ctx.eloDelta) ? 0 : Math.round(ctx.eloDelta);
  return delta === 0 ? `Now ${after} ELO.` : `Now ${after} ELO (${signed(delta)}).`;
}

/**
 * Lines joined by `\n`: what happened, the ELO line (see secondLine; left
 * out when no ELO was recorded), "Tracked on ELO RATED.", the hashtags. Never longer than
 * HIGHLIGHT_CAPTION_MAX: an over-long first line (a very long name) is cut with an ellipsis, the other lines are fixed.
 */
export function buildHighlightCaption(ctx: HighlightCaptionContext): string {
  const line2 = secondLine(ctx);
  const tail = [...(line2 === null ? [] : [line2]), TRACKED, HASHTAGS].join("\n");
  const budget = HIGHLIGHT_CAPTION_MAX - tail.length - 1;
  let line1 = firstLine(ctx);
  if (line1.length > budget) line1 = cutWithEllipsis(line1, budget);
  return `${line1}\n${tail}`;
}

/** Instagram's collaborator invite, which puts one post on both profiles. */
export function buildCollabTip(opponentName: string | null): string {
  const who = cleanName(opponentName) ?? "your opponent";
  return `Tag ${who} as a collaborator: in Instagram tap Tag people, then Invite collaborator. One post shows on both profiles.`;
}
