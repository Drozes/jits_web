/**
 * Per-moment "clearest angle" from the highlight planner (research 03,
 * v1 item 7). The planner already scores every angle 0 to 10 per dominant
 * moment, but the client contract is not settled (keys pending in jr_be),
 * so this reads any of the likely shapes defensively and returns nothing
 * when none is present: a moment chip then simply seeks on the angle on
 * screen, as today.
 *
 * Accepted entry shapes (on the analysis or the match), times on the
 * timeline's (reference) clock in seconds:
 *   { t_s | timestamp_s | t, best_video_id | video_id, clarity?: { [video_id]: 0..10 } }
 */
export interface MomentAngle {
  t: number;
  bestVideoId: string | null;
  clarity: Record<string, number>;
}

const KEYS = ["moment_angles", "momentAngles", "moment_clarity"] as const;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function readMomentAngles(...sources: unknown[]): MomentAngle[] {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const key of KEYS) {
      const list = (src as Record<string, unknown>)[key];
      if (!Array.isArray(list)) continue;
      const out: MomentAngle[] = [];
      for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const t = num(r.t_s) ?? num(r.timestamp_s) ?? num(r.t);
        if (t == null) continue;
        const best = typeof r.best_video_id === "string" ? r.best_video_id : typeof r.video_id === "string" ? r.video_id : null;
        const clarity: Record<string, number> = {};
        if (r.clarity && typeof r.clarity === "object") {
          for (const [id, score] of Object.entries(r.clarity as Record<string, unknown>)) {
            const s = num(score);
            if (s != null) clarity[id] = s;
          }
        }
        out.push({ t, bestVideoId: best, clarity });
      }
      if (out.length > 0) return out;
    }
  }
  return [];
}

/** Within this of a chip's time, a planner moment is the same moment. */
export const MOMENT_MATCH_S = 3;

/**
 * The angle a moment chip should open on: the planner's clearest switchable
 * angle for the moment nearest `t`, or null (stay on the angle on screen).
 */
export function clearestAngleFor(t: number, moments: MomentAngle[], switchable: string[]): string | null {
  let best: MomentAngle | null = null;
  for (const m of moments) {
    const d = Math.abs(m.t - t);
    if (d <= MOMENT_MATCH_S && (best == null || d < Math.abs(best.t - t))) best = m;
  }
  if (!best) return null;
  const scored = Object.entries(best.clarity)
    .filter(([id]) => switchable.includes(id))
    .sort((a, b) => b[1] - a[1]);
  if (scored.length > 0) return scored[0][0];
  return best.bestVideoId && switchable.includes(best.bestVideoId) ? best.bestVideoId : null;
}
