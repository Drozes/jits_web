import type { CSSProperties } from "react";
import { APP_STORE_COMING_SOON_LABEL, APP_STORE_LABEL, appStoreUrl } from "@/lib/app-store";
import { PRIMARY_CTA, SECONDARY_CTA } from "@/components/invites/styles";

interface AppStoreCtaProps {
  /** Red Signal CTA fill when this is the surface's one primary action. */
  primary: boolean;
  /** Optional tap handler (invite telemetry). Only passed from client components. */
  onClick?: () => void;
}

/** Neutral, never red: a non-link cannot be acted on (spec P3). */
const COMING_SOON: CSSProperties = {
  ...SECONDARY_CTA,
  cursor: "default",
  color: "var(--text-secondary)",
};

/**
 * The App Store download CTA shared by the landing and invite pages. While
 * NEXT_PUBLIC_APP_STORE_URL is unset it renders a non-link coming-soon state.
 */
export function AppStoreCta({ primary, onClick }: AppStoreCtaProps) {
  const url = appStoreUrl();
  if (!url) {
    return (
      <span data-testid="app-store-coming-soon" style={COMING_SOON}>
        {APP_STORE_COMING_SOON_LABEL}
      </span>
    );
  }
  return (
    <a href={url} data-testid="app-store-link" onClick={onClick} style={primary ? PRIMARY_CTA : SECONDARY_CTA}>
      {APP_STORE_LABEL}
    </a>
  );
}
