/**
 * Parse a "mm:ss" or plain seconds string into an integer number of seconds.
 *
 * Returns `null` when the input is empty, malformed, or out of bounds.
 * Accepted forms:
 *   - "1:23"  -> 83
 *   - "12:09" -> 729
 *   - "45"    -> 45
 *   - ""      -> null
 */
export function parseFinishTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    const m = Number.parseInt(parts[0], 10);
    const s = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    if (m < 0 || s < 0 || s > 59) return null;
    return m * 60 + s;
  }

  const seconds = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}
