"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { acceptJoinAction, claimInviteAction, confirmDobAndClaimAction } from "@/app/c/[token]/actions";
import { withNext } from "@/lib/auth/safe-next-path";
import { invitePath } from "@/lib/invites/constants";
import { DOB_SAVE_FAILED_COPY, UNDERAGE_COPY } from "@jits/shared/utils";
import {
  APP_SETUP_OUTCOME,
  APP_SIGN_IN_OUTCOME,
  TRY_AGAIN_OUTCOME,
  type InviteOutcome,
} from "@/lib/invites/outcome-copy";
import type { InAppBrowser, InviteKind } from "@/lib/invites/types";
import type { InviteViewer } from "@/lib/invites/viewer";
import { AppFirstLinks, CopyLinkButton, InviteStoreBadges, OpenInAppButton } from "./app-links";
import { InviteDobStep } from "./invite-dob-step";
import { InviteOutcomeCard } from "./invite-outcome-card";
import { GHOST_CTA, PRIMARY_CTA, SECONDARY_CTA } from "./styles";

interface InviteActionsProps {
  token: string;
  kind: InviteKind;
  inviterFirstName: string | null;
  viewer: InviteViewer["state"];
  inAppBrowser: InAppBrowser;
  /** False while the web app is locked: no links into /login, /signup or /eua. */
  webAppEnabled: boolean;
}

/**
 * The action stack. At most one red CTA: Accept for an active athlete,
 * Finish setup for a pending one (web app unlocked), Try again after a
 * transient failure, and Open in app everywhere else that has a real next
 * step (AppFirstLinks). The store badges are never red, live or not. A
 * dead-end error has no red CTA. While the web app is locked, setup and
 * sign-in happen in the app (specs/web-landing/spec.md 7.3).
 */
export function InviteActions({ token, kind, inviterFirstName, viewer, inAppBrowser, webAppEnabled }: InviteActionsProps) {
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

  // Success (match ready, booked, now friends) or a hand-off to the app
  // (finish setup or sign in there, while the web app is locked): it all
  // continues in the app, so Open in app is the one red CTA.
  if (
    outcome?.kind === "ready" ||
    outcome?.kind === "booked" ||
    outcome?.kind === "friends" ||
    (outcome?.kind === "error" && isAppHandoff(outcome))
  ) {
    return (
      <div style={STACK}>
        <InviteOutcomeCard outcome={outcome} />
        <AppFirstLinks {...links} />
      </div>
    );
  }

  // Dead-end error (expired, taken, withdrawn, own link, link off, ...): no
  // red CTA. An under-16 viewer is blocked from the app too, so they get
  // neither Open in app nor the store badges.
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

  if (!webAppEnabled && (viewer === "pending" || viewer === "no_athlete")) {
    return (
      <div style={STACK}>
        <AppFirstLinks {...links} />
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

  return (
    <div style={STACK}>
      <AppFirstLinks {...links} />
      <CopyLinkButton {...links} />
      {webAppEnabled && (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Link href={withNext("/signup", next)} style={SECONDARY_CTA}>
            Sign up on web
          </Link>
          <Link href={withNext("/login", next)} style={GHOST_CTA}>
            Log in
          </Link>
        </div>
      )}
    </div>
  );
}

/** next/navigation redirect() throws an error tagged with this digest. */
function isNextRedirect(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * APP_SETUP_OUTCOME / APP_SIGN_IN_OUTCOME are kind "error" but send the
 * athlete on to the app. Outcomes cross the server-action boundary as plain
 * objects, so they are matched by copy, not identity.
 */
function isAppHandoff(outcome: { body: string }): boolean {
  return [APP_SETUP_OUTCOME, APP_SIGN_IN_OUTCOME].some((o) => "body" in o && o.body === outcome.body);
}

const STACK: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--space-3)" };
