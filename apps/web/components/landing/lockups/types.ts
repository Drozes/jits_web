/**
 * Thomas's crown lockups as data (specs/web-landing/addendum-teaser-v2.md
 * section 1.2). Element order, fills, data-part and fill-rule are kept
 * exactly as drawn; the path data is pinned by lockups.test.ts.
 */
export interface LockupPath {
  d: string;
  fill?: string;
  part?: string;
  fillRule?: "evenodd" | "nonzero";
  /** Wordmark words animated on their own in the intro. */
  lk?: "w1" | "w2";
}

export interface LockupGroup {
  lk: "we" | "word" | "crown" | "you";
  fill?: string;
  /** Some crowns sit in an inner `<g transform>`; kept apart from the animated group. */
  innerTransform?: string;
  paths: LockupPath[];
}

export interface LockupArt {
  id: string;
  viewBox: string;
  /** Cap height X in user units (intro offsets); null for the header lockup. */
  x: number | null;
  groups: LockupGroup[];
  /** Ungrouped paths (the header lockup). */
  paths?: LockupPath[];
}
