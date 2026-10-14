"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { acceptJoinAction, claimInviteAction, confirmDobAndClaimAction } from "@/app/c/[token]/actions";
import { withNext } from "@/lib/auth/safe-next-path";
import { invitePath } from "@/lib/invites/constants";
import { DOB_SAVE_FAILED_COPY, UNDERAGE_COPY } from "@jits/shared/utils";
import { TRY_AGAIN_OUTCOME, type InviteOutcome } from "@/lib/invites/outcome-copy";
import type { InAppBrowser, InviteKind } from "@/lib/invites/types";
import type { InviteViewer } from "@/lib/invites/viewer";
import { CopyLinkButton, InviteStoreBadges, OpenInAppButton } from "./app-links";
import { InviteDobStep } from "./invite-dob-step";
import { InviteOutcomeCard } from "./invite-outcome-card";
import { GHOST_CTA, PRIMARY_CTA } from "./styles";

interface InviteActionsProps {
  token: string;
  kind: InviteKind;
  inviterFirstName: string | null;
  viewer: InviteViewer["state"];
  inAppBrowser: InAppBrowser;
}

/**
 * The action stack. Exactly one red CTA: Accept for an active athlete,
 * Finish setup for a pending one, Open in app after a web booking (the
 * match itself is played in the app) and Sign up on web for everyone else.
 * The store badges are never the red CTA: until a listing is live its
 * badge is a "Coming soon" placeholder, not an action.
 */
export function InviteActions({ token, kind, inviterFirstName, viewer, inAppBrowser }: InviteActionsProps) {
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);
  const [pending, startTransition] = useTransition();
  const links = { token, inAppBrowser, kind };
  const next = invitePath(token);
  const verb = kind === "challenge" ? "accept" : "join";

  const runAction = (call: () => Promise<InviteOutcome>, onFail: InviteOutcome) =>
    startTransition(async () => {
      try {
        setOutcome(await call());
      } catch (err) {
        // redirect() from the action (setup, login) must propagate.
        if (isNextRedirect(err)) throw err;
        // The action call itself failed (offline, deploy in flight).
        setOutcome(onFail);
      }
    });

  const accept = () =>
    runAction(
      () => (kind === "challenge" ? claimInviteAction(token) : acceptJoinAction(token, inviterFirstName)),
      TRY_AGAIN_OUTCOME,
    );

  // dob_required: save the date of birth, then the same claim runs again.
  if (outcome?.kind === "dob") {
    const current = outcome;
    return (
      <div style={STACK}>
        <InviteDobStep
          outcome={current}
          pending={pending}
          onSubmit={(dob) =>
            runAction(() => confirmDobAndClaimAction(token, dob), { ...current, error: DOB_SAVE_FAILED_COPY })
          }
        />
        <OpenInAppButton {...links} />
      </div>
    );
  }

  // Transient failure: keep the accept path open with an explicit retry.
  if (outcome?.kind === "retry") {
    return (
      <div style={STACK}>
        <InviteOutcomeCard outcome={outcome} />
        <button type="button" onClick={accept} disabled={pending} style={{ ...PRIMARY_CTA, opacity: pending ? "var(--opacity-disabled)" : 1 }}>
          {pending ? "Trying again..." : "Try again"}
        </button>
        <OpenInAppButton {...links} />
        <InviteStoreBadges {...links} />
      </div>
    );
  }

  // Success: the match is ready, the web booking is done or the athletes are
  // now friends. All of it continues in the app, so opening it is the one
  // real action and the only red CTA.
  if (outcome?.kind === "ready" || outcome?.kind === "booked" || outcome?.kind === "friends") {
    return (
      <div style={STACK}>
        <InviteOutcomeCard outcome={outcome} />
        <OpenInAppButton {...links} primary />
        <InviteStoreBadges {...links} />
      </div>
    );
  }

  // Error (expired, taken, withdrawn, own link, link off, under 16, ...):
  // nothing to do here, so no red CTA. An under-16 viewer is blocked from
  // the app too, so they get neither Open in app nor the store badges.
  if (outcome?.kind === "error") {
    const underage = outcome.body === UNDERAGE_COPY;
    return (
      <div style={STACK}>
        <InviteOutcomeCard outcome={outcome} />
        {!underage && <OpenInAppButton {...links} />}
        {!underage && <InviteStoreBadges {...links} />}
      </div>
    );
  }

  if (viewer === "active") {
    return (
      <div style={STACK}>
        <button type="button" onClick={accept} disabled={pending} style={{ ...PRIMARY_CTA, opacity: pending ? "var(--opacity-disabled)" : 1 }}>
          {pending ? "Accepting..." : kind === "challenge" ? "Accept challenge" : "Accept invite"}
        </button>
        <OpenInAppButton {...links} />
        <InviteStoreBadges {...links} />
      </div>
    );
  }

  if (viewer === "pending" || viewer === "no_athlete") {
    const href = withNext(viewer === "pending" ? "/eua" : "/signup", next);
    return (
      <div style={STACK}>
        <Link href={href} style={PRIMARY_CTA}>Finish setup to {verb}</Link>
        <OpenInAppButton {...links} />
        <InviteStoreBadges {...links} />
      </div>
    );
  }

  // Signed out. Signing up on web is the one path that always works (the
  // store listings may still be "Coming soon"), so it is the red CTA.
  return (
    <div style={STACK}>
      <Link href={withNext("/signup", next)} style={PRIMARY_CTA}>
        Sign up on web
      </Link>
      <OpenInAppButton {...links} />
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Link href={withNext("/login", next)} style={GHOST_CTA}>
          Log in
        </Link>
        <CopyLinkButton {...links} />
      </div>
      <InviteStoreBadges {...links} />
    </div>
  );
}

/** next/navigation redirect() throws an error tagged with this digest. */
function isNextRedirect(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const STACK: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-3)" };
