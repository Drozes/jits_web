import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Mail } from "lucide-react";

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
    id: "ranked-vs-casual",
    question: "What is a ranked vs casual match?",
    answer:
      "Ranked matches affect your ELO rating and appear on your record. Casual matches are for practice only and don't impact your rating. Choose the match type when challenging an opponent or creating a match in the session lobby.",
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
      <PageContainer className="pt-6 space-y-6">
        <section>
          <h2 className="text-base font-semibold mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <FAQItem key={item.id} question={item.question} answer={item.answer} />
            ))}
          </div>
        </section>

        <section className="border-t border-border/50 pt-6">
          <h2 className="text-base font-semibold mb-4">Need More Help?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Have a question we didn't cover? Reach out to our support team.
          </p>
          <a
            href="mailto:support@elorated.com"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Mail className="h-4 w-4" />
            Email Support
          </a>
        </section>
      </PageContainer>
    </>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-lg border border-border/50 bg-card p-4 hover:border-border/80 transition-colors">
      <summary className="cursor-pointer font-medium text-sm flex items-center justify-between">
        <span>{question}</span>
        <span className="text-muted-foreground group-open:rotate-180 transition-transform ml-2">
          ▼
        </span>
      </summary>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{answer}</p>
    </details>
  );
}
