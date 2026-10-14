import { LANDING_CAPS, LANDING_COLUMN } from "./styles";

const STEPS = [
  { n: "01", title: "Go live", body: "Show the room you're ready to roll." },
  { n: "02", title: "Roll", body: "Challenge someone on the mat. Your phone films the match." },
  { n: "03", title: "Get rated", body: "You both confirm the result. Beat someone bigger, earn more." },
] as const;

/** How it works: three numbered steps, no icons, no red. */
export function LandingSteps() {
  return (
    <section aria-labelledby="how-it-works" style={{ background: "var(--bg-primary)", paddingTop: "var(--space-10)", paddingBottom: "var(--space-12)" }}>
      <div style={LANDING_COLUMN}>
        <h2 id="how-it-works" style={{ ...LANDING_CAPS, fontWeight: 400, marginBottom: "var(--space-4)" }}>
          HOW IT WORKS
        </h2>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                columnGap: "var(--space-4)",
                rowGap: "var(--space-1)",
                padding: "var(--space-5) 0",
                borderTop: i === 0 ? "none" : "1px solid var(--border-hairline)",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--size-body)", fontVariantNumeric: "tabular-nums", color: "var(--text-tertiary)", gridRow: "span 2", paddingTop: 2 }}>
                {step.n}
              </span>
              <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "var(--size-heading-m)", textTransform: "uppercase", letterSpacing: "var(--ls-caps)", color: "var(--text-primary)", margin: 0 }}>
                {step.title}
              </h3>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--size-body-l)", lineHeight: "var(--lh-relaxed)", color: "var(--text-secondary)", margin: 0 }}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
