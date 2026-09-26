import Link from "next/link";
import type { MyActiveMatch } from "@jits/shared/api/queries";
import { MetaTag, Plate } from "@/components/ui/elo-system";

/**
 * Home's way back into an Arena match the tab lost (jits-jitg, mirrors mobile's
 * `components/dashboard/resume-match-card.tsx`): closed or reloaded mid-match,
 * or a "Your Arena match started" toast that never got an answer. Only shown
 * while one is open, and it only offers: resuming is the athlete's tap. While
 * it is up, Resume is Home's one Signal Red CTA (the live session plate steps
 * down to secondary).
 *
 * Resume links to the same `/arena/match/<id>` route the handshake lands on,
 * and the wizard derives its step from `matches.status`.
 */
export function ResumeMatchCard({ match }: { match: MyActiveMatch }) {
  const started = match.status === "in_progress";
  return (
    <Plate variant="accent">
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: "var(--space-2)", gap: "var(--space-2)" }}
      >
        <h2
          className="font-heading font-bold truncate"
          style={{
            fontSize: "var(--size-heading-m)",
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: "var(--lh-snug)",
          }}
        >
          {started ? "Match in progress" : "Match waiting to start"}
        </h2>
        <MetaTag>{started ? "In progress" : "Waiting"}</MetaTag>
      </div>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--size-body-s)",
          color: "var(--text-secondary)",
          margin: 0,
          marginBottom: "var(--space-3)",
        }}
      >
        {match.opponentName ? `vs ${match.opponentName}. ` : ""}
        Pick up where you left off.
      </p>
      <Link
        href={`/arena/match/${match.matchId}`}
        aria-label="Resume your match"
        className="inline-flex w-full items-center justify-center font-heading font-bold uppercase transition-colors"
        style={{
          background: "var(--accent-cta)",
          color: "var(--text-on-accent)",
          padding: "var(--space-3) var(--space-5)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          borderRadius: "var(--radius-sm)",
          textDecoration: "none",
          gap: "var(--space-2)",
        }}
      >
        Resume match <span aria-hidden>→</span>
      </Link>
    </Plate>
  );
}
