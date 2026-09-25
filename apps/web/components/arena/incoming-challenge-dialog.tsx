"use client";

import { useEffect, useId, useRef } from "react";
import type { IncomingChallenge } from "@/hooks/use-arena-challenge";
import { IncomingChallengePlate } from "./incoming-challenge-plate";

interface IncomingChallengeDialogProps {
  incoming: IncomingChallenge;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Non-modal alert dialog for an incoming challenge on a non-Arena page. Focus
 * moves to the dialog itself (never straight onto Accept, so a stray Enter
 * cannot start a match) unless the athlete is typing, and returns to where it
 * was when the dialog closes. Escape declines. Labelled by the heading only,
 * so it is announced once.
 */
export function isTypingTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.isContentEditable ||
    !!el.closest('[contenteditable]:not([contenteditable="false"])')
  );
}

export function IncomingChallengeDialog({
  incoming,
  busy,
  onAccept,
  onDecline,
}: IncomingChallengeDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    if (isTypingTarget(previous)) return;
    const node = ref.current;
    node?.focus();
    return () => {
      // Hand focus back only if it is still ours or was dropped with the
      // dialog; if the athlete moved on, leave it where they put it.
      const active = document.activeElement;
      const ours = !active || active === document.body || !!node?.contains(active);
      if (ours && previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [incoming.challengeId]);

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onDecline();
      }}
      className="pointer-events-auto w-full max-w-md outline-none"
    >
      <IncomingChallengePlate
        headingId={headingId}
        name={incoming.challengerName}
        onAccept={onAccept}
        onDecline={onDecline}
        disabled={busy}
      />
    </div>
  );
}
