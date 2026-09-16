"use client";

import { useState } from "react";
import Link from "next/link";
import { Plate, Avatar32, MetaTag, LivePill } from "@/components/ui/elo-system";
import { getProfilePhotoUrl } from "@/lib/utils";
import { useLobbyIds, useLobbyPresence } from "@/hooks/use-lobby-presence";
import { useArenaChallenge } from "@/hooks/use-arena-challenge";
import { LookingForMatchToggle } from "./looking-for-match-toggle";

/** Compact neutral action used for in-row Challenge. */
function RowAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-heading font-bold uppercase"
      style={{
        minHeight: 44,
        padding: "0 var(--space-3)",
        background: "transparent",
        color: "var(--text-primary)",
        border: "1px solid var(--border-hairline-strong)",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--size-label-m)",
        letterSpacing: "var(--ls-caps)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        transition: "background var(--motion-hover)",
      }}
    >
      {label}
    </button>
  );
}

interface Competitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName?: string;
  weight?: number;
  profilePhotoUrl?: string;
  /** opponent ELO minus yours: a strength GAP, not a rating change. */
  eloDiff: number;
}

function SectionLabel({
  id,
  label,
  meta,
}: {
  id: string;
  label: string;
  meta: string;
}) {
  return (
    <h2
      id={id}
      className="grid grid-cols-[1fr_auto] items-baseline"
      style={{
        margin: 0,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        // --text-tertiary measures ~3.97:1 on --bg-primary, under AA; the
        // count gets full foreground so the hierarchy survives the bump.
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-xl)",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          color: "var(--text-primary)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {meta}
      </span>
    </h2>
  );
}

function CompetitorRow({
  competitor,
  inLobby,
  hasPendingChallenge,
  onChallenge,
  challengeDisabled,
}: {
  competitor: Competitor;
  inLobby: boolean;
  hasPendingChallenge: boolean;
  onChallenge: () => void;
  challengeDisabled: boolean;
}) {
  const { displayName, currentElo, eloDiff, gymName, weight } = competitor;
  const gap = eloDiff > 0 ? `+${eloDiff}` : String(eloDiff);

  return (
    <Plate
      variant={inLobby ? "live" : "default"}
      style={{ padding: "var(--space-3) var(--space-4)" }}
    >
      <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
        <Link
          href={`/athlete/${competitor.id}`}
          aria-label={`${displayName}, ELO ${currentElo}`}
          className="flex items-center"
          style={{
            textDecoration: "none",
            gap: "var(--space-3)",
            minWidth: 0,
            flex: 1,
          }}
        >
          <Avatar32
            name={displayName}
            photoUrl={getProfilePhotoUrl(competitor.profilePhotoUrl ?? null)}
          />

          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="font-heading font-bold"
              style={{
                fontSize: "var(--size-heading-s)",
                color: "var(--text-primary)",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>

            <div
              className="font-mono"
              style={{
                fontSize: "var(--size-num-s)",
                color: "var(--text-primary)",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                marginTop: 2,
              }}
            >
              {currentElo}
              {eloDiff !== 0 && (
                <span style={{ color: "var(--text-secondary)" }}>
                  {"  "}
                  {gap} vs you
                </span>
              )}
            </div>

            {(gymName || weight) && (
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--size-body-xs)",
                  color: "var(--text-secondary)",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {[gymName, weight ? `${weight} lbs` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
        </Link>

        <div
          className="flex items-center"
          style={{ gap: "var(--space-2)", flexShrink: 0 }}
        >
          {/* Only online athletes get the instant handshake: an offline
              opponent cannot answer a live prompt. The Plate's green rule
              already marks them live, so the pill is dropped when the action
              is present rather than crowding a narrow row. */}
          {inLobby && !hasPendingChallenge ? (
            <RowAction
              label="Challenge"
              onClick={onChallenge}
              disabled={challengeDisabled}
            />
          ) : (
            <div
              className="flex flex-col items-end"
              style={{ gap: "var(--space-1)" }}
            >
              {inLobby && <LivePill label="In lobby" />}
              {hasPendingChallenge && <MetaTag>Challenged</MetaTag>}
            </div>
          )}
        </div>
      </div>
    </Plate>
  );
}

function EmptyLobby({ isLooking }: { isLooking: boolean }) {
  return (
    <Plate variant="accent">
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          color: "var(--text-secondary)",
          letterSpacing: "var(--ls-caps-xl)",
        }}
      >
        Lobby empty
      </div>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--size-body)",
          color: "var(--text-primary)",
          margin: "var(--space-2) 0 0",
          lineHeight: "var(--lh-base)",
        }}
      >
        {isLooking
          ? "You're live, but nobody else is yet. You'll show up here for them the moment they arrive."
          : "When athletes go live, they show up here. Go live above and be the first."}
      </p>
      <div
        className="flex flex-wrap"
        style={{ gap: "var(--space-4)", marginTop: "var(--space-3)" }}
      >
        <Link
          href="/leaderboard"
          className="font-heading font-bold uppercase"
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--size-label-m)",
            letterSpacing: "var(--ls-caps)",
            textDecoration: "none",
          }}
        >
          Browse rankings →
        </Link>
        <Link
          href="/gyms"
          className="font-heading font-bold uppercase"
          style={{
            color: "var(--text-secondary)",
            fontSize: "var(--size-label-m)",
            letterSpacing: "var(--ls-caps)",
            textDecoration: "none",
          }}
        >
          Find an open mat →
        </Link>
      </div>
    </Plate>
  );
}

/** Live prompt when someone challenges you. Owns the surface's red CTA. */
function IncomingChallengePlate({
  name,
  onAccept,
  onDecline,
  disabled,
}: {
  name: string;
  onAccept: () => void;
  onDecline: () => void;
  disabled: boolean;
}) {
  return (
    <Plate variant="live">
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-num-xs)",
          color: "var(--text-secondary)",
          letterSpacing: "var(--ls-caps-xl)",
        }}
      >
        Incoming challenge
      </div>
      <h2
        className="font-heading font-bold"
        style={{
          fontSize: "var(--size-heading-m)",
          color: "var(--text-primary)",
          margin: "var(--space-1) 0 0",
        }}
      >
        {name} wants to roll
      </h2>
      <div
        className="grid grid-cols-2"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}
      >
        <button
          type="button"
          onClick={onDecline}
          disabled={disabled}
          className="font-heading font-bold uppercase"
          style={{
            minHeight: 44,
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-hairline-strong)",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--size-label-l)",
            letterSpacing: "var(--ls-caps)",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="font-heading font-bold uppercase"
          style={{
            minHeight: 44,
            background: "var(--accent-cta)",
            color: "var(--text-on-accent)",
            border: "1px solid transparent",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--size-label-l)",
            letterSpacing: "var(--ls-caps)",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          Accept
        </button>
      </div>
    </Plate>
  );
}

/** Shown to the challenger while the opponent decides. */
function WaitingPlate({
  name,
  onCancel,
  disabled,
}: {
  name: string;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <Plate variant="live">
      <div
        className="flex items-center justify-between"
        style={{ gap: "var(--space-3)" }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            className="font-heading font-bold"
            style={{
              fontSize: "var(--size-heading-m)",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Waiting for {name}
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--text-secondary)",
              margin: "var(--space-1) 0 0",
            }}
          >
            You&apos;ll both drop into the match the moment they accept.
          </p>
        </div>
        <LivePill label="Sent" />
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="font-heading font-bold uppercase"
        style={{
          marginTop: "var(--space-4)",
          width: "100%",
          minHeight: 44,
          background: "transparent",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-hairline-strong)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        Cancel
      </button>
    </Plate>
  );
}

export function ArenaContent({
  lookingCompetitors,
  currentAthleteId,
  currentAthleteWeight,
  currentAthleteRanked,
  challengedIds = [],
}: {
  lookingCompetitors: Competitor[];
  currentAthleteId: string;
  currentAthleteWeight: number | null;
  currentAthleteRanked: boolean;
  challengedIds?: string[];
}) {
  // Own the lobby:online channel here. Arena is the only consumer, this
  // component is guaranteed to hydrate (it renders the list), and it keeps the
  // channel off every other screen.
  useLobbyPresence(currentAthleteId, false, currentAthleteRanked);
  const challengedSet = new Set(challengedIds);
  const lobbyIds = useLobbyIds();
  // Mirrors the toggle so the empty-state copy cannot contradict the button in
  // the window between a successful write and router.refresh() landing.
  const [isLooking, setIsLooking] = useState(currentAthleteRanked);
  const {
    incoming,
    outgoing,
    isBusy,
    sendChallenge,
    accept,
    decline,
    cancelOutgoing,
  } = useArenaChallenge({
    athleteId: currentAthleteId,
    athleteWeight: currentAthleteWeight,
  });

  const online = lookingCompetitors.filter((c) => lobbyIds.has(c.id));
  const offline = lookingCompetitors.filter((c) => !lobbyIds.has(c.id));

  return (
    <div
      className="flex flex-col animate-page-in"
      style={{ gap: "var(--space-6)" }}
    >
      {incoming ? (
        <IncomingChallengePlate
          name={incoming.challengerName}
          onAccept={accept}
          onDecline={decline}
          disabled={isBusy}
        />
      ) : outgoing ? (
        <WaitingPlate
          name={outgoing.opponentName}
          onCancel={cancelOutgoing}
          disabled={isBusy}
        />
      ) : (
        <LookingForMatchToggle
          athleteId={currentAthleteId}
          initialRanked={currentAthleteRanked}
          onChange={setIsLooking}
        />
      )}

      {lookingCompetitors.length === 0 ? (
        <EmptyLobby isLooking={isLooking} />
      ) : (
        <>
          {/* Always rendered, even at zero, so the online/offline split stays
              learnable instead of the page silently losing its structure. */}
          <section
            aria-labelledby="arena-online"
            className="flex flex-col"
            style={{ gap: "var(--space-2)" }}
          >
            <SectionLabel
              id="arena-online"
              label="Online now"
              meta={`${online.length}`}
            />
            {online.length > 0 ? (
              online.map((c) => (
                <CompetitorRow
                  key={c.id}
                  competitor={c}
                  inLobby
                  hasPendingChallenge={challengedSet.has(c.id)}
                  onChallenge={() => sendChallenge(c.id, c.displayName)}
                  challengeDisabled={isBusy || !!outgoing || !!incoming}
                />
              ))
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--size-body-s)",
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                Nobody has the app open right now.
              </p>
            )}
          </section>

          {offline.length > 0 && (
            <section
              aria-labelledby="arena-offline"
              className="flex flex-col"
              style={{ gap: "var(--space-2)" }}
            >
              <SectionLabel
                id="arena-offline"
                label="Open to challenges"
                meta={`${offline.length}`}
              />
              {offline.map((c) => (
                <CompetitorRow
                  key={c.id}
                  competitor={c}
                  inLobby={false}
                  hasPendingChallenge={challengedSet.has(c.id)}
                  onChallenge={() => sendChallenge(c.id, c.displayName)}
                  challengeDisabled={isBusy || !!outgoing || !!incoming}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
