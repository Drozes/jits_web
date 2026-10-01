import { challengeStatLine, inviterShortName, joinStatLine } from "@/lib/invites/format";
import type { InviteKind, PreviewInviter } from "@/lib/invites/types";
import { CAPS_LABEL } from "./styles";

interface InviteHeroProps {
  kind: InviteKind;
  inviter: PreviewInviter;
}

/** Who is inviting, as big as the OG card says it: name, ELO, weight. */
export function InviteHero({ kind, inviter }: InviteHeroProps) {
  const name = inviterShortName(inviter);
  const initials =
    name
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Z]/g, "")[0] ?? "")
      .join("")
      .slice(0, 2) || "?";
  return (
    <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "var(--space-3)" }}>
      <div
        aria-hidden="true"
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          overflow: "hidden",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-hairline-strong)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-display)",
          fontSize: 36,
          color: "var(--text-secondary)",
        }}
      >
        {inviter.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={inviter.avatar_url} alt="" width={88} height={88} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials
        )}
      </div>
      <span style={CAPS_LABEL}>{kind === "challenge" ? "Challenge" : "Invite"}</span>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(40px, 12vw, 64px)",
          lineHeight: "var(--lh-display)",
          letterSpacing: "var(--ls-mark)",
          color: "var(--text-primary)",
          margin: 0,
          overflowWrap: "anywhere",
        }}
      >
        {kind === "challenge" ? `${name} challenges you` : `Join ${name} on ELO RATED`}
      </h1>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontSize: "var(--size-num-s)",
          color: "var(--text-secondary)",
          margin: 0,
        }}
      >
        {kind === "challenge" ? challengeStatLine(inviter) : joinStatLine(inviter)}
      </p>
    </section>
  );
}
