import styles from "./hero-ticker.module.css";
import type { TickOutcome, TickSample } from "./ticker-samples";

/** Tones are inline styles so unit tests can read them (P20); a draw is neutral (P11). */
export const TICK_TONE: Record<TickOutcome, string> = {
  WIN: "var(--state-positive)",
  LOSS: "var(--state-negative)",
  DRAW: "var(--state-neutral)",
};

export function HeroTickerLine({ tick, leaving }: { tick: TickSample; leaving: boolean }) {
  return (
    <span data-testid="hero-ticker-line" className={`${styles.line} ${leaving ? styles.leave : styles.enter}`}>
      <span style={{ color: "var(--text-secondary)" }}>{tick.lbs} LBS</span>
      <span style={{ color: "var(--text-tertiary)" }}>{" · "}{tick.outcome}{" "}</span>
      <span data-testid="hero-ticker-delta" style={{ color: TICK_TONE[tick.outcome], fontWeight: 700 }}>
        <span className={styles.arrow}>{tick.delta > 0 ? "▲" : "▼"}</span>
        {Math.abs(tick.delta)}
      </span>
    </span>
  );
}
