import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";

type HelpSection = {
  title: string;
  paragraphs: string[];
};

const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Getting Started",
    paragraphs: [
      "ELO RATED is a participation-only ranking platform. You join a session at a partner gym, complete matches, and the system handles your rating.",
      "Start by attending an open mat at a gym tagged as an ELO session. Geofence + waiver confirm you're on the mat before you can join the lobby.",
    ],
  },
  {
    title: "How ELO Works",
    paragraphs: [
      "Universal starting rating. No belt seeding. Weight is normalized into the exchange so heavier athletes get a small phantom-ELO offset (+50 per IBJJF division gap).",
      "Submission-only. Tap or don't. Draws cost ELO for both fighters, equal matches get the harshest Pressure Score penalty.",
      "Wins, losses, and draws all move your number. Your number is your number.",
    ],
  },
  {
    title: "Match Footage & Privacy",
    paragraphs: [
      "You own your match footage. You can always download it from your profile. Server-side retention on the free tier may be limited; access to your own data is not.",
      "Your profile and rating are public on the global ladder. Personal data is governed by the Privacy Policy linked in the End User Agreement.",
    ],
  },
  {
    title: "Report a Problem",
    paragraphs: [
      "Spotted a wrong result, a dispute that wasn't resolved, or a participant violating gym rules? Send a feedback note from Settings, Feedback.",
      "For urgent issues (safety, abuse, account compromise), email support@elorated.com with the match ID.",
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <AppHeader title="Help & Support" back />
      <PageContainer className="pt-6">
        <div
          className="flex flex-col"
          style={{ gap: "var(--space-4)" }}
        >
          {HELP_SECTIONS.map((section) => (
            <Plate key={section.title} section={section} />
          ))}
        </div>
      </PageContainer>
    </>
  );
}

function Plate({ section }: { section: HelpSection }) {
  return (
    <section
      className="bg-card rounded"
      style={{ padding: "var(--space-4)" }}
    >
      <h2
        className="font-heading font-bold text-primary"
        style={{
          fontSize: "18px",
          marginBottom: "var(--space-3)",
        }}
      >
        {section.title}
      </h2>
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        {section.paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="font-body text-secondary"
            style={{
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}
