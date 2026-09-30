/**
 * Client mirror of the backend Instagram handle rules (jr_be-ahn.2):
 *   normalize_instagram_handle(p) = NULLIF(lower(regexp_replace(btrim(p), '^@+', '')), '')
 *   is_valid_instagram_handle(p)  = p IS NULL OR (p ~ '^[a-z0-9._]{1,30}$' AND no leading/trailing/double dot)
 *
 * `athletes.instagram_handle` and `gyms.instagram_handle` both store the
 * normalized form (no @, lowercase) and CHECK it, so a value that passes
 * `isValidInstagramInput` here is accepted by the server, and blank clears.
 */

const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;
const BAD_DOTS = /(^\.|\.$|\.\.)/;

/** Trim, strip leading @s, lowercase; blank becomes null. */
export function normalizeInstagramHandle(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const normalized = raw.trim().replace(/^@+/, "").toLowerCase();
  return normalized === "" ? null : normalized;
}

/** True for null (not set) or a normalized, well-formed handle. */
export function isValidInstagramHandle(normalized: string | null): boolean {
  if (normalized === null) return true;
  return HANDLE_PATTERN.test(normalized) && !BAD_DOTS.test(normalized);
}

/** Validate raw user input the way the server will: normalize, then check. Blank is valid. */
export function isValidInstagramInput(raw: string | null | undefined): boolean {
  return isValidInstagramHandle(normalizeInstagramHandle(raw));
}

/** Display form for a stored handle ("marcus" -> "@marcus"); empty for null. */
export function formatInstagramHandle(handle: string | null | undefined): string {
  return handle ? `@${handle}` : "";
}
