"use client";

import { LiveDot } from "@/components/ui/elo-system";
import { useArenaOnlineCount, useIsArenaLive } from "@/lib/arena/arena-store";

/** Badge text for the online count: capped so it fits a nav icon corner. */
export function formatOnlineCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}

function onlineLabel(count: number): string {
  return `${count} ${count === 1 ? "athlete" : "athletes"} online in the Arena`;
}

const badge = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--size-num-xs)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  lineHeight: "14px",
  minWidth: 16,
  padding: "0 3px",
  textAlign: "center",
  color: "var(--text-primary)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-xs)",
} as const;

/**
 * Arena nav status, visual half: a pulsing green dot while the viewer is live,
 * and a mono count of OTHER athletes in the lobby when there are any. "rail"
 * sits inline after the sidebar label; "bar" pins to the corners of the
 * bottom-nav icon (dot top-left, count top-right) so the two never overlap.
 * Hidden from assistive tech: pair it with <ArenaNavStatusLabel /> placed
 * AFTER the visible label so the link reads "Arena, live, 3 athletes ...".
 */
export function ArenaNavStatus({ variant }: { variant: "rail" | "bar" }) {
  const isLive = useIsArenaLive();
  const count = useArenaOnlineCount();
  if (!isLive && count <= 0) return null;

  const bar = variant === "bar";
  return (
    <>
      {isLive && (
        <LiveDot
          data-testid="arena-live-dot"
          className={bar ? "absolute -left-2 -top-1" : undefined}
        />
      )}
      {count > 0 && (
        <span
          aria-hidden
          data-testid="arena-online-count"
          className={bar ? "absolute -right-3.5 -top-2" : "inline-block"}
          style={badge}
        >
          {formatOnlineCount(count)}
        </span>
      )}
    </>
  );
}

/** Screen-reader half of the Arena status, so it is never colour-only. */
export function ArenaNavStatusLabel() {
  const isLive = useIsArenaLive();
  const count = useArenaOnlineCount();
  const parts = [isLive && "live", count > 0 && onlineLabel(count)].filter(
    Boolean,
  );
  if (parts.length === 0) return null;
  return <span className="sr-only">, {parts.join(", ")}</span>;
}
