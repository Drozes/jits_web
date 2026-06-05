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

/**
 * Validate an entered finish time against the match length.
 *
 * The finish time is optional, so an empty / default input is treated as
 * valid (the result step submits no finish time in that case). A non-empty
 * input is valid only when it parses (see `parseFinishTime`) AND falls
 * within the match duration: a submission cannot land after the bout ended.
 *
 *   isFinishTimeValid("", 600)      -> true   (optional, omitted)
 *   isFinishTimeValid("   ", 600)   -> true   (optional, omitted)
 *   isFinishTimeValid("4:30", 600)  -> true   (270 <= 600)
 *   isFinishTimeValid("10:00", 600) -> true   (600 <= 600, boundary)
 *   isFinishTimeValid("11:00", 600) -> false  (660 > 600)
 *   isFinishTimeValid("59:59", 600) -> false  (mm:ss past duration)
 *   isFinishTimeValid("abc", 600)   -> false  (malformed)
 */
export function isFinishTimeValid(input: string, durationSeconds: number): boolean {
  if (!input.trim()) return true; // optional field: omitting it is allowed
  const parsed = parseFinishTime(input);
  if (parsed == null) return false;
  return parsed <= durationSeconds;
}
