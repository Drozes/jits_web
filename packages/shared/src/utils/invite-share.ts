/**
 * Invite share copy (jr_be spec 016, contract section 6). The link goes inside
 * the message only (the share sheet gets no `url` key), so every target
 * app receives one text with the link in it.
 */

export type InviteKind = "join" | "challenge";

/** The challenge or join share message, exact template from the contract. */
export function buildInviteShareMessage(
  kind: InviteKind,
  url: string,
  codeDisplay?: string | null,
): string {
  if (kind === "join") {
    return `Train with me on ELO RATED, ranked jiu-jitsu. Join me: ${url}`;
  }
  const code = codeDisplay ? ` (code ${codeDisplay})` : "";
  return `I'm calling you out on ELO RATED. Ranked roll, my number vs yours. Accept: ${url}${code}`;
}

/** WhatsApp shortcut: opens WhatsApp with the message prefilled. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** SMS shortcut (iOS form): opens Messages with the body prefilled. */
export function smsShareUrl(message: string): string {
  return `sms:&body=${encodeURIComponent(message)}`;
}
