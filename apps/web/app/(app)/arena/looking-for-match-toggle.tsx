"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { toggleMatchPreferences } from "@jits/shared/api/mutations";
import { joinLobby, leaveLobby } from "@/hooks/use-lobby-presence";
import { Plate, LivePill } from "@/components/ui/elo-system";

interface LookingForMatchToggleProps {
  athleteId: string;
  initialRanked: boolean;
  onChange?: (isLooking: boolean) => void;
}

/**
 * The one Signal Red CTA on the Arena surface.
 *
 * Deliberately a button, not a Switch: the brand system allows exactly one
 * primary CTA per surface, and going visible is the most important action
 * here. The previous Radix Switch was an 18x32px target (below the 44px
 * minimum) sitting on a plate that looked tappable but was not.
 */
export function LookingForMatchToggle({
  athleteId,
  initialRanked,
  onChange,
}: LookingForMatchToggleProps) {
  const router = useRouter();
  const [isLooking, setIsLooking] = useState(initialRanked);
  const [isSaving, setIsSaving] = useState(false);
  const [, startTransition] = useTransition();
  // useTransition's pending flag is only true while the transition itself is
  // in flight, i.e. false for the whole await below. A ref set synchronously
  // before the await is what actually closes the double-tap window.
  const inFlight = useRef(false);

  async function handleToggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSaving(true);

    // Ranked-only product: casual was removed in 47f166b, so the flag is
    // always cleared. get_arena_data filters on (casual OR ranked), so ranked
    // alone is enough to appear in the Arena list.
    const next = !isLooking;
    setIsLooking(next);
    onChange?.(next);

    const supabase = createClient();
    const result = await toggleMatchPreferences(supabase, athleteId, {
      lookingForCasual: false,
      lookingForRanked: next,
    });

    if (!result.ok) {
      setIsLooking(!next);
      onChange?.(!next);
      toast.error("Couldn't update your status. Try again.");
      inFlight.current = false;
      setIsSaving(false);
      return;
    }

    if (next) {
      joinLobby({
        athlete_id: athleteId,
        looking_for_casual: false,
        looking_for_ranked: true,
      });
    } else {
      leaveLobby();
    }

    inFlight.current = false;
    setIsSaving(false);
    startTransition(() => router.refresh());
  }

  return (
    <Plate variant={isLooking ? "live" : "default"}>
      <div
        className="grid grid-cols-[1fr_auto] items-start"
        style={{ gap: "var(--space-3)" }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            className="font-heading font-bold"
            style={{
              fontSize: "var(--size-heading-m)",
              color: "var(--text-primary)",
              lineHeight: "var(--lh-snug)",
              margin: 0,
            }}
          >
            Looking for Match
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--text-secondary)",
              margin: "var(--space-1) 0 0",
              lineHeight: "var(--lh-base)",
            }}
          >
            {isLooking
              ? "You're in the lobby. Opponents can challenge you now."
              : "Turn on to appear in the lobby so opponents can challenge you."}
          </p>
        </div>
        {isLooking && <LivePill label="Live" />}
      </div>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isSaving}
        className="font-heading font-bold uppercase"
        style={{
          marginTop: "var(--space-4)",
          width: "100%",
          minHeight: 44,
          background: isLooking ? "transparent" : "var(--accent-cta)",
          color: isLooking ? "var(--text-secondary)" : "var(--text-on-accent)",
          border: isLooking
            ? "1px solid var(--border-hairline-strong)"
            : "1px solid transparent",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          cursor: isSaving ? "default" : "pointer",
          opacity: isSaving ? 0.6 : 1,
          transition: "background var(--motion-hover), color var(--motion-hover)",
        }}
      >
        {isLooking ? "Go offline" : "Go live"}
      </button>
    </Plate>
  );
}
