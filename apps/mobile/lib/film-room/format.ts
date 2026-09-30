import { formatClock } from "@jits/shared/utils";
import type { LibraryOutcome, MatchLibraryItem } from "@jits/shared/api/film-room";

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Mina Park" -> "M. Park"; a single name is kept as is. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Opponent";
  if (parts.length === 1) return parts[0];
  return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`;
}

export function outcomeLetter(outcome: LibraryOutcome): "W" | "L" | "D" | null {
  if (outcome === "win") return "W";
  if (outcome === "loss") return "L";
  if (outcome === "draw") return "D";
  return null;
}

/** "Won" / "Lost" / "Draw" for accessibility copy. */
export function outcomeWord(outcome: LibraryOutcome): string {
  if (outcome === "win") return "Won";
  if (outcome === "loss") return "Lost";
  if (outcome === "draw") return "Draw";
  return "No result";
}

/** "▲ +14" / "▼ −9" (true minus sign) / "± 0"; null when unknown. */
export function deltaLabel(delta: number | null | undefined): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ −${Math.abs(delta)}`;
  return "± 0";
}

/**
 * The card's data line: rating change then how long it went, e.g.
 * "▲ +14 · 06:17". Every match is ranked; a legacy row with no recorded delta
 * shows only the time. The time is the finish time of a submission, else the
 * configured clock.
 */
export function cardLine(item: MatchLibraryItem): string {
  const parts: string[] = [];
  const delta = deltaLabel(item.elo_delta);
  if (delta) parts.push(delta);
  const t = item.finish_time_seconds ?? item.duration_seconds;
  if (t != null && t > 0) parts.push(formatClock(t));
  return parts.join(" · ");
}

/** "SEP 27" */
export function shortDate(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return "";
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getDate()).padStart(2, "0")}`;
}

/** "Sep 27" for body copy. */
export function titleDate(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return "";
  const m = MONTHS[d.getMonth()];
  return `${m[0]}${m.slice(1, 3).toLowerCase()} ${d.getDate()}`;
}

/** Group key and heading: "2026-09" / "SEPTEMBER 2026". */
export function monthOf(iso: string | null | undefined): { key: string; label: string } {
  const d = parse(iso);
  if (!d) return { key: "unknown", label: "UNDATED" };
  return {
    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  };
}

export function matchCountLabel(n: number): string {
  return `${n} ${n === 1 ? "MATCH" : "MATCHES"}`;
}

/** "24 MATCHES · 15W 7L 2D · 1526" (rating omitted when unknown). */
export function recordStrip(
  record: { wins: number; losses: number; draws: number },
  rating: number | null | undefined,
): string {
  const total = record.wins + record.losses + record.draws;
  const parts = [
    matchCountLabel(total),
    `${record.wins}W ${record.losses}L ${record.draws}D`,
  ];
  if (rating != null) parts.push(String(rating));
  return parts.join(" · ");
}
