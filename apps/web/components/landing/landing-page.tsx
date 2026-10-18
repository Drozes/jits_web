import { LandingFooter } from "./landing-footer";
import { LandingHero } from "./landing-hero";

/**
 * The public landing page served at "/" while the web app is locked
 * (specs/web-landing/spec.md). data-theme="dark" forces the brand dark
 * tokens even when a visitor stored the light theme. Brand variables only.
 * data-crown="colour" gives the crown lockups their red belt bar ("mono"
 * turns it white; specs/web-landing/addendum-teaser-v2.md P21).
 * LandingIntro and LandingSteps are hidden for now (owner, 2026-10-18);
 * the components are kept so they can return.
 */
export function LandingPage() {
  return (
    <main
      data-theme="dark"
      data-crown="colour"
      data-testid="landing"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        minHeight: "100svh",
        overflowX: "hidden",
      }}
    >
      <LandingHero />
      <LandingFooter />
    </main>
  );
}
