"use client";

import type {
  IncomingChallenge,
  OutgoingChallenge,
} from "@/hooks/use-arena-challenge";
import { useInlineChallengeSurfaceMounted } from "@/lib/arena/arena-store";
import { IncomingChallengeDialog } from "./incoming-challenge-dialog";
import { OutgoingChallengeBar } from "./outgoing-challenge-bar";

interface ArenaChallengeOverlayProps {
  incoming: IncomingChallenge | null;
  outgoing: OutgoingChallenge | null;
  busy: boolean;
  /** True on immersive routes: the athlete is already in a match. */
  suppressed: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}

/**
 * App-wide challenge overlay: the incoming prompt, or a compact waiting bar
 * for a sent challenge. Sits above the bottom nav (and clear of the top-center
 * toaster), right of the rail at lg. Stands down while a page renders the
 * plates inline (ArenaContent registers itself) and on immersive routes.
 *
 * The container is always rendered, even when empty, so the owner always has
 * real DOM to hydrate against.
 */
export function ArenaChallengeOverlay({
  incoming,
  outgoing,
  busy,
  suppressed,
  onAccept,
  onDecline,
  onCancel,
}: ArenaChallengeOverlayProps) {
  const inline = useInlineChallengeSurfaceMounted();
  const hidden = suppressed || inline;

  return (
    <div
      data-arena-overlay
      className="pointer-events-none fixed inset-x-0 flex justify-center px-4 bottom-[calc(var(--shell-bottom-nav-h)+env(safe-area-inset-bottom)+var(--space-3))] lg:bottom-[var(--space-6)] lg:left-[var(--shell-rail-w)]"
      style={{ zIndex: "var(--shell-z-overlay)" }}
    >
      {!hidden && incoming ? (
        <IncomingChallengeDialog
          incoming={incoming}
          busy={busy}
          onAccept={onAccept}
          onDecline={onDecline}
        />
      ) : !hidden && outgoing ? (
        <OutgoingChallengeBar
          name={outgoing.opponentName}
          onCancel={onCancel}
          disabled={busy}
        />
      ) : null}
    </div>
  );
}
