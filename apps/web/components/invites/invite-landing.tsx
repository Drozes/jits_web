import { Wordmark } from "@/components/ui/elo-system";
import type { InAppBrowser, InvitePreview } from "@/lib/invites/types";
import type { InviteViewer } from "@/lib/invites/viewer";
import { AppStoreButton } from "./app-links";
import { InAppBrowserHint } from "./in-app-browser-hint";
import { InviteActions } from "./invite-actions";
import { InviteCodeBlock } from "./invite-code-block";
import { InviteHero } from "./invite-hero";
import { SignedInAs } from "./signed-in-as";
import { BODY_TEXT, CAPS_LABEL } from "./styles";

interface InviteLandingProps {
  token: string;
  preview: InvitePreview;
  viewer: InviteViewer;
  inAppBrowser: InAppBrowser;
}

/** Public invite landing (contract 6). Phone-first: most opens are in-app browsers. */
export function InviteLanding({ token, preview, viewer, inAppBrowser }: InviteLandingProps) {
  return (
    <main style={PAGE}>
      <div style={COLUMN}>
        <header style={{ display: "flex", justifyContent: "center", paddingBottom: "var(--space-2)" }}>
          <Wordmark size="md" />
        </header>
        <InAppBrowserHint inAppBrowser={inAppBrowser} />
        {preview.state === "open" ? (
          <>
            <InviteHero kind={preview.kind} inviter={preview.inviter} />
            {preview.kind === "challenge" && preview.short_code_display && (
              <InviteCodeBlock token={token} code={preview.short_code_display} inAppBrowser={inAppBrowser} />
            )}
            <InviteActions
              token={token}
              kind={preview.kind}
              inviterFirstName={preview.inviter.first_name}
              viewer={viewer.state}
              inAppBrowser={inAppBrowser}
            />
            {(viewer.state === "active" || viewer.state === "pending") && (
              <SignedInAs token={token} displayName={viewer.displayName} />
            )}
          </>
        ) : (
          <Unavailable token={token} inAppBrowser={inAppBrowser} />
        )}
        <p style={{ ...CAPS_LABEL, textAlign: "center", marginTop: "auto", paddingTop: "var(--space-6)" }}>
          Ranked jiu-jitsu. Find out where you stand.
        </p>
      </div>
    </main>
  );
}

function Unavailable({ token, inAppBrowser }: { token: string; inAppBrowser: InAppBrowser }) {
  return (
    <section data-testid="invite-unavailable" style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", textAlign: "center" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px, 12vw, 56px)", lineHeight: "var(--lh-display)", color: "var(--text-primary)", margin: 0 }}>
        Invite unavailable
      </h1>
      <p style={{ ...BODY_TEXT, fontSize: "var(--size-body-l)" }}>
        This invite is no longer available. Ask your training partner for a new one.
      </p>
      <AppStoreButton token={token} inAppBrowser={inAppBrowser} primary />
    </section>
  );
}

const PAGE: React.CSSProperties = {
  minHeight: "100svh",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  paddingTop: "max(var(--space-5), env(safe-area-inset-top))",
  paddingBottom: "max(var(--space-5), env(safe-area-inset-bottom))",
  paddingLeft: "var(--space-4)",
  paddingRight: "var(--space-4)",
};

const COLUMN: React.CSSProperties = {
  maxWidth: 420,
  minHeight: "calc(100svh - 2 * var(--space-5))",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-5)",
};
