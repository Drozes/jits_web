"use client";

import { useState } from "react";
import { Check, Link2, Smartphone } from "lucide-react";
import { sendLandingEvent } from "@/lib/invites/beacon";
import { APP_STORE_URL, inviteSchemeUrl } from "@/lib/invites/constants";
import type { InAppBrowser } from "@/lib/invites/types";
import { GHOST_CTA, PRIMARY_CTA, SECONDARY_CTA } from "./styles";

interface LinkProps {
  token: string;
  inAppBrowser: InAppBrowser;
}

/** App Store button. Red only when it is the surface's one primary CTA. */
export function AppStoreButton({ token, inAppBrowser, primary }: LinkProps & { primary: boolean }) {
  return (
    <a
      href={APP_STORE_URL}
      onClick={() => sendLandingEvent(token, "app_store_tapped", inAppBrowser)}
      style={primary ? PRIMARY_CTA : SECONDARY_CTA}
    >
      Get it on the App Store
    </a>
  );
}

/**
 * `elorated://c/<token>`: a same-domain https link never triggers the
 * universal link from the page itself, so the app is opened by scheme.
 */
export function OpenInAppButton({ token, inAppBrowser }: LinkProps) {
  return (
    <a
      href={inviteSchemeUrl(token)}
      onClick={() => sendLandingEvent(token, "open_in_app_tapped", inAppBrowser)}
      style={SECONDARY_CTA}
    >
      <Smartphone size={16} aria-hidden="true" />
      Open in app
    </a>
  );
}

export function CopyLinkButton({ token, inAppBrowser }: LinkProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split(/[?#]/)[0]);
      setCopied(true);
      sendLandingEvent(token, "link_copied", inAppBrowser);
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
