import { LANDING_CAPS, LANDING_COLUMN } from "./styles";

/**
 * What ELO RATED is, in words, right under the hero (addendum P16): the
 * tagline, body line and data strip that used to sit in the photo hero.
 */
export function LandingIntro() {
  return (
    <section data-testid="landing-intro" style={{ background: "var(--bg-primary)", paddingTop: "var(--space-12)" }}>
      <div style={{ ...LANDING_COLUMN, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <p style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "var(--size-heading-m)", color: "var(--text-primary)", margin: 0 }}>
          What&apos;s your number?
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--size-body-l)", lineHeight: "var(--lh-relaxed)", color: "var(--text-secondary)", margin: 0 }}>
          BJJ matches, filmed and rated. Go live, roll, confirm the result. Your ELO moves.
        </p>
        <p style={LANDING_CAPS}>NO-GI · SUBMISSION ONLY · EVERY MATCH RANKED</p>
      </div>
    </section>
  );
}
