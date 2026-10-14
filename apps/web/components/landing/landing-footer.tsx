import Link from "next/link";
import type { CSSProperties } from "react";
import { Wordmark } from "@/components/ui/elo-system";
import { LANDING_COLUMN } from "./styles";

/** 44px tap target; the hover underline comes from the class. */
const LINK: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "0 var(--space-2)",
  color: "var(--text-secondary)",
  textUnderlineOffset: 3,
};

const SMALL: CSSProperties = { fontFamily: "var(--font-body)", fontSize: "var(--size-label-l)", color: "var(--text-tertiary)", margin: 0 };

export function LandingFooter() {
  return (
    <footer style={{ background: "var(--bg-primary)", borderTop: "1px solid var(--border-hairline)", paddingTop: "var(--space-8)", paddingBottom: "max(var(--space-8), env(safe-area-inset-bottom))" }}>
      <div style={{ ...LANDING_COLUMN, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <Wordmark size="sm" />
        <nav aria-label="Legal and support" style={{ display: "flex", flexWrap: "wrap", marginLeft: "calc(-1 * var(--space-2))", fontFamily: "var(--font-body)", fontSize: "var(--size-body)" }}>
          <Link href="/terms" className="hover:underline" style={LINK}>Terms</Link>
          <Link href="/privacy" className="hover:underline" style={LINK}>Privacy</Link>
          <Link href="/support" className="hover:underline" style={LINK}>Support</Link>
        </nav>
        <p lang="fr" style={{ ...SMALL, display: "flex", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ marginRight: "var(--space-1)" }}>Français :</span>
          <Link href="/terms/fr" className="hover:underline" style={{ ...LINK, fontSize: "var(--size-label-l)" }}>Conditions</Link>
          <Link href="/privacy/fr" className="hover:underline" style={{ ...LINK, fontSize: "var(--size-label-l)" }}>Confidentialité</Link>
        </p>
        <p style={SMALL}>© 2026 ELO RATED</p>
      </div>
    </footer>
  );
}
