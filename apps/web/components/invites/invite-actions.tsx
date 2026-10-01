"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { acceptJoinAction, claimInviteAction, confirmDobAndClaimAction } from "@/app/c/[token]/actions";
import { withNext } from "@/lib/auth/safe-next-path";
import { invitePath } from "@/lib/invites/constants";
import { DOB_SAVE_FAILED_COPY } from "@jits/shared/utils";
import { TRY_AGAIN_OUTCOME, type InviteOutcome } from "@/lib/invites/outcome-copy";
import type { InAppBrowser, InviteKind } from "@/lib/invites/types";
import type { InviteViewer } from "@/lib/invites/viewer";
import { AppStoreButton, CopyLinkButton, OpenInAppButton } from "./app-links";
import { InviteDobStep } from "./invite-dob-step";
import { InviteOutcomeCard } from "./invite-outcome-card";
import { GHOST_CTA, PRIMARY_CTA, SECONDARY_CTA } from "./styles";

interface InviteActionsProps {
  token: string;
  kind: InviteKind;
  inviterFirstName: string | null;
  viewer: InviteViewer["state"];
  inAppBrowser: InAppBrowser;
}

/**
 * The action stack. Exactly one red CTA: Accept for an active athlete,
 * Finish setup for a pending one, the App Store for everyone else (and
 * after a web booking, since the match itself is played in the app).
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
        <AppStoreButton {...links} primary={false} />
      </div>
    );
  }

  // The match already exists: it is played in the app, so open it there.
  if (outcome?.kind === "ready") {
    return (
      <div style={STACK}>
        <InviteOutcomeCard outcome={outcome} />
        <OpenInAppButton {...links} primary />
        <AppStoreButton {...links} primary={false} />
      </div>
    );
  }

  if (outcome && outcome.kind !== "setup") {
    return (
      <div style={STACK}>
        <InviteOutcomeCard outcome={outcome} />
        <AppStoreButton {...links} primary />
        <OpenInAppButton {...links} />
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
        <AppStoreButton {...links} primary={false} />
      </div>
    );
  }

  if (viewer === "pending" || viewer === "no_athlete") {
    const href = withNext(viewer === "pending" ? "/eua" : "/signup", next);
    return (
      <div style={STACK}>
        <Link href={href} style={PRIMARY_CTA}>Finish setup to {verb}</Link>
        <OpenInAppButton {...links} />
        <AppStoreButton {...links} primary={false} />
      </div>
    );
  }

  return (
    <div style={STACK}>
      <AppStoreButton {...links} primary />
      <OpenInAppButton {...links} />
      <CopyLinkButton {...links} />
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Link href={withNext("/signup", next)} style={SECONDARY_CTA}>
          Sign up on web
        </Link>
        <Link href={withNext("/login", next)} style={GHOST_CTA}>
          Log in
        </Link>
      </div>
    </div>
  );
}

/** next/navigation redirect() throws an error tagged with this digest. */
function isNextRedirect(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const STACK: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-3)" };
