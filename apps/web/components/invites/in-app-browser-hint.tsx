import { Compass } from "lucide-react";
import type { InAppBrowser } from "@/lib/invites/types";
import { BODY_TEXT } from "./styles";

const HOW_TO: Record<Exclude<InAppBrowser, null>, string> = {
  instagram: "Tap ••• at the top right, then Open in external browser.",
  facebook: "Tap ••• at the bottom right, then Open in browser.",
  messenger: "Tap ••• at the top right, then Open in browser.",
  other: "Use your app's menu to open this page in Safari.",
};

/**
 * In-app browsers (Instagram, Facebook, Messenger) cannot hand a link to the
 * installed app, so point the athlete at Safari first.
 */
export function InAppBrowserHint({ inAppBrowser }: { inAppBrowser: InAppBrowser }) {
  if (!inAppBrowser) return null;
  return (
    <aside
      data-testid="in-app-browser-hint"
      style={{
        display: "flex",
        gap: "var(--space-3)",
        alignItems: "flex-start",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
      }}
    >
      <Compass size={18} aria-hidden="true" style={{ color: "var(--text-primary)", flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ ...BODY_TEXT, color: "var(--text-primary)", fontFamily: "var(--font-heading)", fontWeight: 700 }}>
          Open in Safari
        </p>
        <p style={BODY_TEXT}>{HOW_TO[inAppBrowser]}</p>
      </div>
    </aside>
  );
}
