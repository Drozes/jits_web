import { LandingFooter } from "./landing-footer";
import { LandingHero } from "./landing-hero";
import { LandingSteps } from "./landing-steps";

/**
 * The public landing page served at "/" while the web app is locked
 * (specs/web-landing/spec.md). data-theme="dark" forces the brand dark
 * tokens even when a visitor stored the light theme. Brand variables only.
 */
export function LandingPage() {
  return (
    <main
      data-theme="dark"
      data-testid="landing"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        minHeight: "100svh",
        overflowX: "hidden",
      }}
    >
      <LandingHero />
      <LandingSteps />
      <LandingFooter />
    </main>
  );
}
