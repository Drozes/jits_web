import Link from "next/link";
import { Plate } from "@/components/ui/elo-system";
import { LivePill } from "@/components/ui/elo-system";
import type { GymListItem } from "@jits/shared/types/session";

interface GymRowProps {
  gym: GymListItem;
  isMyGym: boolean;
  scheduleLabel?: string | null;
}

export function GymRow({ gym, isMyGym, scheduleLabel }: GymRowProps) {
  const live = gym.hasActiveSession;
  const subtitle = [
    gym.city,
    live ? `${gym.memberCount} in lobby` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/gyms/${gym.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <Plate
        variant={live ? "live" : "default"}
        className="gym-row"
        style={{ cursor: "pointer", padding: "var(--space-4)" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-2)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              fontSize: "var(--size-heading-m)",
              color: "var(--text-primary)",
              lineHeight: 1.15,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {gym.name}
            {isMyGym && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--size-num-xs)",
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--ls-caps-l)",
                  marginLeft: "var(--space-2)",
                  fontWeight: 700,
                }}
              >
                · My Gym
              </span>
            )}
          </span>
          {live ? (
            <LivePill label="Live" />
          ) : scheduleLabel ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--size-num-xs)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "var(--ls-caps-l)",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {scheduleLabel}
            </span>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--size-num-xs)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "var(--ls-caps-l)",
                whiteSpace: "nowrap",
              }}
            >
              No Sessions
            </span>
          )}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-xs)",
              color: "var(--text-tertiary)",
            }}
          >
            {subtitle}
          </div>
        )}
      </Plate>
    </Link>
  );
}
