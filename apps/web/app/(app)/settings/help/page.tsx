import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";

const faqItems = [
  {
    id: "join-session",
    question: "How do I join a session?",
    answer:
      "Go to the Gyms tab to find your gym. Select an upcoming session and tap the join button. Complete the 4-step wizard: confirm your location, accept any required waivers, enter your current weight, and confirm your details. You'll appear in the session lobby where you can challenge other participants.",
  },
  {
    id: "elo-rating",
    question: "How does ELO rating work?",
    answer:
      "Your ELO starts at 1000. After each ranked match, you gain or lose points based on the match result and your opponent's rating. Beating a higher-rated opponent gains more points. Losing to a lower-rated opponent loses more points. Draws cost both athletes ELO (the pressure score penalty).",
  },
  {
    id: "ranked-matches",
    question: "Are all matches ranked?",
    answer:
      "Yes. Every match on ELO RATED is ranked and affects your ELO rating. This keeps competition meaningful and ensures your record accurately reflects your performance on the mats.",
  },
  {
    id: "record-result",
    question: "How do I record a match result?",
    answer:
      "After the match timer ends, the result entry screen appears. Both athletes must confirm the outcome (submission, points, or draw). Once both confirm, the match is recorded. If there's a disagreement, either athlete can dispute the result.",
  },
  {
    id: "change-weight",
    question: "Can I change my weight class?",
    answer:
      "Yes, you can update your weight in Profile settings before each session. This ensures accurate ELO calculations, as weight divisions affect the stakes. Update your weight before joining a session.",
  },
  {
    id: "report-issue",
    question: "How do I report an issue?",
    answer:
      "Go to Settings > Feedback to report bugs or issues. Our team reviews all feedback and will follow up with you if needed.",
  },
];

export default function HelpPage() {
  return (
    <>
      <AppHeader title="Help & Support" back />
      <PageContainer className="pt-6">
        <div
          className="flex flex-col animate-page-in"
          style={{ gap: "var(--space-6)" }}
        >
          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <SectionTitle>Frequently Asked Questions</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {faqItems.map((item) => (
                <FAQItem key={item.id} question={item.question} answer={item.answer} />
              ))}
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <SectionTitle>Need More Help?</SectionTitle>
            <Plate>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--size-body-s)",
                  color: "var(--text-secondary)",
                  lineHeight: "var(--lh-loose)",
                  margin: 0,
                  marginBottom: "var(--space-4)",
                }}
              >
                Have a question we did not cover? Reach out to our support team.
              </p>
              <a
                href="mailto:support@elorated.com"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-heading)",
                  fontSize: "var(--size-label-l)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "var(--ls-caps)",
                  padding: "var(--space-3) var(--space-4)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--accent-cta)",
                  color: "var(--text-on-accent)",
                  textDecoration: "none",
                  transition: "background var(--motion-hover)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--accent-cta-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--accent-cta)";
                }}
              >
                Email Support
              </a>
            </Plate>
          </section>
        </div>
      </PageContainer>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: "var(--size-heading-m)",
        fontWeight: 700,
        color: "var(--text-primary)",
        margin: 0,
        lineHeight: "var(--lh-snug)",
      }}
    >
      {children}
    </h2>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <Plate>
      <details className="group">
        <summary
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            fontFamily: "var(--font-heading)",
            fontSize: "var(--size-heading-s)",
            fontWeight: 700,
            color: "var(--text-primary)",
            listStyle: "none",
          }}
        >
          <span>{question}</span>
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--size-num-s)",
              color: "var(--text-tertiary)",
              transition: "transform var(--motion-fade)",
            }}
            className="group-open:rotate-180"
          >
            ▼
          </span>
        </summary>
        <p
          style={{
            marginTop: "var(--space-3)",
            marginBottom: 0,
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-s)",
            color: "var(--text-secondary)",
            lineHeight: "var(--lh-loose)",
          }}
        >
          {answer}
        </p>
      </details>
    </Plate>
  );
}
