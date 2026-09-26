import Link from "next/link";
import { Avatar32, MetaTag, Plate } from "@/components/ui/elo-system";
import { cn } from "@/lib/utils";
import type { MatchDetailView, MatchParticipant } from "@jits/shared/api/queries";
import { formatRelativeDate, formatVideoDuration } from "@jits/shared/utils";

const VERDICT: Record<string, { word: string; className: string }> = {
  win: { word: "WIN", className: "text-foreground" },
  loss: { word: "LOSS", className: "text-[var(--state-negative)]" },
  draw: { word: "DRAW", className: "text-amber-500" },
};
const NO_RESULT = { word: "NO RESULT", className: "text-muted-foreground" };

const RESULT_LABEL: Record<string, string> = { submission: "Submission", draw: "Draw" };

/** Result plate, opponent link and meta row (spec 3.1 items 2 to 4). */
export function MatchResultHeader({ view }: { view: MatchDetailView }) {
  const { match, me, opponent } = view;
  const verdict = (me.outcome && VERDICT[me.outcome]) || NO_RESULT;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <Plate>
        <div className="flex items-start justify-between" style={{ gap: "var(--space-3)" }}>
          <span
            data-testid="match-verdict"
            className={cn("font-display uppercase leading-none", verdict.className)}
            style={{ fontSize: "var(--size-display-xs)" }}
          >
            {verdict.word}
          </span>
          <StatusChip status={match.status} />
        </div>
        {match.match_type === "ranked" ? (
          <EloChange me={me} />
        ) : (
          <p className="text-sm text-muted-foreground" style={{ marginTop: "var(--space-2)" }}>
            Casual, unrated
          </p>
        )}
        {match.status === "disputed" && (
          <p className="text-sm text-muted-foreground" style={{ marginTop: "var(--space-2)" }}>
            This result is disputed and under review.
          </p>
        )}
      </Plate>

      {opponent && <OpponentRow opponent={opponent} />}

      <MetaRow view={view} />
    </div>
  );
}

function EloChange({ me }: { me: MatchParticipant }) {
  const delta = me.elo_delta ?? 0;
  // Draws always cost ELO (Pressure Score), so a draw reads amber, not red.
  const tone =
    me.outcome === "draw" ? "text-amber-500" : delta > 0 ? "text-success" : delta < 0 ? "text-[var(--state-negative)]" : "text-muted-foreground";
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  return (
    <div className="flex items-baseline" style={{ gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
      <span data-testid="match-elo-delta" className={cn("font-mono font-bold tabular-nums text-2xl", tone)}>
        {sign}
      </span>
      {me.elo_before != null && me.elo_after != null && (
        <span className="font-mono tabular-nums text-sm text-muted-foreground">
          {me.elo_before} → {me.elo_after}
        </span>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status !== "disputed" && status !== "voided" && status !== "cancelled") return null;
  const disputed = status === "disputed";
  return (
    <span
      data-testid="match-status-chip"
      className={cn(
        "font-mono uppercase text-xs border",
        disputed ? "text-amber-500 border-amber-500" : "text-muted-foreground border-[var(--border-hairline-strong)]",
      )}
      style={{ padding: "var(--space-1) var(--space-2)", borderRadius: "var(--radius-xs)", letterSpacing: "var(--ls-caps-l)" }}
    >
      {status}
    </span>
  );
}

function OpponentRow({ opponent }: { opponent: MatchParticipant }) {
  return (
    <Link
      href={`/athlete/${opponent.athlete_id}`}
      prefetch={false}
      aria-label={`View ${opponent.display_name}'s profile`}
      className="grid grid-cols-[auto_1fr_auto] items-center transition-colors hover:!bg-[var(--bg-elevated-hover)]"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <Avatar32 name={opponent.display_name} photoUrl={opponent.profile_photo_url} />
      <span className="font-heading font-bold truncate" style={{ color: "var(--text-primary)" }}>
        {opponent.display_name}
      </span>
      <span className="font-mono tabular-nums text-sm" style={{ color: "var(--text-primary)" }}>
        {opponent.current_elo}
      </span>
    </Link>
  );
}

function MetaRow({ view }: { view: MatchDetailView }) {
  const { match } = view;
  const date = match.completed_at ?? match.started_at;
  const duration = formatVideoDuration(match.duration_seconds);
  const resultLabel = match.result ? RESULT_LABEL[match.result] : undefined;
  return (
    <div className="flex flex-wrap items-center text-xs text-muted-foreground" style={{ gap: "var(--space-2)" }}>
      {date && <span className="tabular-nums">{formatRelativeDate(date)}</span>}
      <MetaTag>{match.match_type === "ranked" ? "Ranked" : "Casual"}</MetaTag>
      {duration && <span className="font-mono tabular-nums">{duration}</span>}
      {resultLabel && <span>{resultLabel}</span>}
    </div>
  );
}
