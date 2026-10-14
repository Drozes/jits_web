"use client";

import { useState } from "react";
import { Check, Link2, Smartphone } from "lucide-react";
import { sendLandingEvent } from "@/lib/invites/beacon";
import { AppStoreCta } from "@/components/app-store/app-store-cta";
import { isAppStoreLive } from "@/lib/app-store";
import { inviteSchemeUrl } from "@/lib/invites/constants";
import type { InAppBrowser, InviteKind } from "@/lib/invites/types";
import { GHOST_CTA, PRIMARY_CTA, SECONDARY_CTA } from "./styles";

interface LinkProps {
  token: string;
  inAppBrowser: InAppBrowser;
  /** Invite kind for tap telemetry; null on the unavailable page. */
  kind?: InviteKind | null;
}

/**
 * App Store button. Red only when it is the surface's one primary CTA; a
 * neutral non-link "Coming soon" state while the listing is not public.
 */
export function AppStoreButton({ token, inAppBrowser, kind = null, primary }: LinkProps & { primary: boolean }) {
  return (
    <AppStoreCta primary={primary} onClick={() => sendLandingEvent(token, "app_store_tapped", inAppBrowser, kind)} />
  );
}

/**
 * The App Store as the stack's primary CTA, then Open in app. While the store
 * URL is unset the coming-soon state cannot be acted on, so Open in app takes
 * the red fill and comes first (spec P3: one actionable red CTA per surface).
 */
export function StoreFirstLinks(props: LinkProps) {
  if (isAppStoreLive()) {
    return (
      <>
        <AppStoreButton {...props} primary />
        <OpenInAppButton {...props} />
      </>
    );
  }
  return (
    <>
      <OpenInAppButton {...props} primary />
      <AppStoreButton {...props} primary />
    </>
  );
}

/**
 * `elorated://c/<token>`: a same-domain https link never triggers the
 * universal link from the page itself, so the app is opened by scheme. Red
 * only when the match already lives in the app (the surface's one CTA).
 */
export function OpenInAppButton({ token, inAppBrowser, kind = null, primary = false }: LinkProps & { primary?: boolean }) {
  return (
    <a
      href={inviteSchemeUrl(token)}
      onClick={() => sendLandingEvent(token, "open_in_app_tapped", inAppBrowser, kind)}
      style={primary ? PRIMARY_CTA : SECONDARY_CTA}
    >
      <Smartphone size={16} aria-hidden="true" />
      Open in app
    </a>
  );
}

export function CopyLinkButton({ token, inAppBrowser, kind = null }: LinkProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split(/[?#]/)[0]);
      setCopied(true);
      sendLandingEvent(token, "link_copied", inAppBrowser, kind);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing to do, the address bar still has the link.
    }
  };
  return (
    <button type="button" onClick={copy} style={GHOST_CTA} aria-live="polite">
      {copied ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
