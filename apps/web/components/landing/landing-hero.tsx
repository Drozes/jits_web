import Image from "next/image";
import { AppStoreCta } from "@/components/app-store/app-store-cta";
import { Wordmark } from "@/components/ui/elo-system";
import { LANDING_CAPS, LANDING_COLUMN } from "./styles";

const OVERLAY =
  "linear-gradient(180deg, color-mix(in srgb, var(--color-void) 45%, transparent) 0%, color-mix(in srgb, var(--color-void) 70%, transparent) 50%, var(--color-void) 100%)";

/** Full-bleed hero: the photo under a Void gradient, copy anchored at the bottom. */
export function LandingHero() {
  return (
    <section style={{ position: "relative", minHeight: "100svh", overflow: "hidden", display: "flex" }}>
      <Image
        src="/landing/hero.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        style={{ objectFit: "cover", objectPosition: "center" }}
      />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: OVERLAY }} />
      <div
        style={{
          ...LANDING_COLUMN,
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          paddingTop: "max(var(--space-5), env(safe-area-inset-top))",
          paddingBottom: "var(--space-10)",
        }}
      >
        <Wordmark size="md" />
        <div style={{ marginTop: "auto", paddingTop: "var(--space-16)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <h1
            aria-label="We are ELO RATED. Are you?"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              fontSize: "clamp(56px, 16vw, 112px)",
              lineHeight: "var(--lh-display)",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            WE ARE
            <br />
            ELO RATED
            <br />
            <span style={{ color: "var(--accent-cta-text)" }}>ARE YOU?</span>
          </h1>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "var(--size-heading-m)", color: "var(--text-primary)", margin: 0 }}>
            What&apos;s your number?
          </p>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--size-body-l)", lineHeight: "var(--lh-relaxed)", color: "var(--text-secondary)", margin: 0 }}>
            BJJ matches, filmed and rated. Go live, roll, confirm the result. Your ELO moves.
          </p>
          <p style={LANDING_CAPS}>NO-GI · SUBMISSION ONLY · EVERY MATCH RANKED</p>
          <div style={{ maxWidth: 360, marginTop: "var(--space-2)" }}>
            <AppStoreCta primary />
          </div>
        </div>
      </div>
    </section>
  );
}
