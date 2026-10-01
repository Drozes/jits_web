import type { PreviewInviter } from "./types";

/** `ALEX R.` style name for cards and titles (contract 6). */
export function inviterShortName(inviter: {
  first_name: string | null;
  last_initial: string | null;
}): string {
  const first = inviter.first_name?.trim();
  const initial = inviter.last_initial?.trim().replace(/\.$/, "");
  if (!first) return "A TRAINING PARTNER";
  return (initial ? `${first} ${initial[0]}.` : first).toUpperCase();
}

/**
 * First name as written, for sentence copy (`Ask Alex for a new one.`).
 * Pass `sentenceStart` when the name opens a sentence so the fallback is
 * capitalised (`Your training partner withdrew this challenge.`).
 */
export function inviterFirstName(
  inviter: { first_name: string | null } | null | undefined,
  opts: { sentenceStart?: boolean } = {},
): string {
  return inviter?.first_name?.trim() || (opts.sentenceStart ? "Your training partner" : "your training partner");
}

export function formatElo(elo: number): string {
  return Math.round(elo).toLocaleString("en-US");
}

/** Line 2 of the challenge card: `1,482 ELO · 172 LBS · Ranked jiu-jitsu match`. */
export function challengeStatLine(inviter: PreviewInviter): string {
  const parts = [`${formatElo(inviter.current_elo)} ELO`];
  if (inviter.weight_lbs != null) parts.push(`${Math.round(inviter.weight_lbs)} LBS`);
  parts.push("Ranked jiu-jitsu match");
  return parts.join(" · ");
}

export function joinStatLine(inviter: PreviewInviter): string {
  return `${formatElo(inviter.current_elo)} ELO · Ranked jiu-jitsu`;
}

export function invitePageTitle(
  preview: { state: "open"; kind: "join" | "challenge"; inviter: PreviewInviter } | { state: "unavailable" },
): string {
  if (preview.state !== "open") return "ELO RATED | Ranked jiu-jitsu";
  const name = inviterShortName(preview.inviter);
  return preview.kind === "challenge"
    ? `${name} challenges you | ELO RATED`
    : `Join ${name} on ELO RATED`;
}
