/**
 * Invite identifiers (jr_be spec 016, contract section 2). Pure helpers used
 * by every client surface that reads a challenge code or an invite link, so
 * the server and both apps normalise input identically.
 */

/** A raw invite token: 16 random bytes, base64url without padding. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

/** A short code after normalisation (Crockford alphabet, no I, L, O, U). */
export const INVITE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * Normalise a typed or pasted short code: uppercase, drop spaces and hyphens,
 * map the look-alikes O->0, I->1, L->1, U->V. Returns the 6-char code, or null
 * when the result is not a valid code.
 */
export function normalizeInviteCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  return INVITE_CODE_RE.test(cleaned) ? cleaned : null;
}

/** `K7Q4M2` -> `K7Q-4M2`. Anything that is not a 6-char code is returned as is. */
export function formatInviteCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** True for a well-formed raw invite token. */
export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_RE.test(value);
}

const TOKEN_IN_TEXT_RE = /\/c\/([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/;

/**
 * The invite carried by arbitrary pasted text (a shared message, a bare link
 * or a code). The first `/c/<token>` wins; otherwise the whole text, or any
 * whitespace-separated word in it, is tried as a short code.
 */
export function extractInviteFromText(
  text: string | null | undefined,
): { token: string } | { code: string } | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const link = text.match(TOKEN_IN_TEXT_RE);
  if (link) return { token: link[1] };
  const whole = normalizeInviteCode(text);
  if (whole) return { code: whole };
  for (const word of text.split(/[\s(),.:;!?"']+/)) {
    const code = normalizeInviteCode(word);
    if (code) return { code };
  }
  return null;
}
