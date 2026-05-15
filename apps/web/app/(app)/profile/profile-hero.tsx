import { MetaTag } from "@/components/ui/elo-system";

interface ProfileHeroProps {
  name: string;
  gymName: string | null;
  weightKg: number | null;
  photoUrl: string | null;
  elo: number;
  rank: number;
  tags?: string[];
}

/**
 * G1 hero. Per spec: athlete-header plate with red 3px bottom accent.
 * Name (DM Sans bold 24px), gym subtitle, meta-tag strip, centered ELO display.
 * Photo is optional: when present, render a 56x56 plate frame above name. No photo by default.
 */
export function ProfileHero({
  name,
  gymName,
  weightKg,
  photoUrl,
  elo,
  rank,
  tags,
}: ProfileHeroProps) {
  const metaTags = tags ?? [
    weightKg ? `${weightKg} kg` : null,
    "No-Gi",
    "Sub-only",
  ].filter(Boolean) as string[];

  return (
    <section
      style={{
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border-hairline)",
        position: "relative",
      }}
    >
      <div
        style={{
          padding: "var(--space-5) var(--space-5) var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
      >
        {photoUrl && (
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-xs)",
              border: "1px solid var(--border-hairline-strong)",
              overflow: "hidden",
              display: "block",
              marginBottom: "var(--space-2)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </span>
        )}
        <h2
          className="font-heading"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "var(--size-heading-l)",
            color: "var(--text-primary)",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {name}
        </h2>
        {gymName && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--text-tertiary)",
            }}
          >
            {gymName}
          </div>
        )}
        {metaTags.length > 0 && (
          <div
            style={{
              marginTop: "var(--space-2)",
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
            }}
          >
            {metaTags.map((t) => (
              <MetaTag key={t}>{t}</MetaTag>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "var(--space-2) var(--space-5) var(--space-6)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-xl)",
            marginBottom: "var(--space-2)",
          }}
        >
          ELO Rating
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: 96,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {elo}
        </div>
        <div
          style={{
            marginTop: "var(--space-3)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-s)",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-l)",
          }}
        >
          <strong style={{ color: "var(--accent-cta)", fontWeight: 700 }}>
            #{rank}
          </strong>{" "}
          · Global
        </div>
      </div>

      {/* Red 3px bottom accent */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: "var(--accent-cta)",
        }}
      />
    </section>
  );
}
