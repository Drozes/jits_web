import { Text, View } from "react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";

/**
 * G4 Help & Support. Static 4-plate layout per wireframe lines 1653-1680,
 * structured like apps/web/app/(app)/settings/help/page.tsx. Each plate has an
 * h2 heading + lede paragraph(s). The copy deliberately diverges from web on
 * how to get a match: mobile has no gym sessions, only the Arena (jits-gewv).
 */
type HelpSection = {
  title: string;
  paragraphs: string[];
};

const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Getting Started",
    paragraphs: [
      "ELO RATED is a participation-only ranking platform. You find opponents in the Arena, complete ranked matches, and the system handles your rating.",
      "Open the Arena tab and tap Go live to join the lobby. Anyone else who is live can challenge you, and you can challenge them. You can have up to 3 challenges out at once.",
      "A challenge arrives as a live prompt. Accept it and you both drop straight into the match, so be on the mat together before you go live.",
      "Keep the Arena open while you're live. A challenge that arrives while you're elsewhere in the app may not show up when you come back.",
    ],
  },
  {
    title: "How ELO Works",
    paragraphs: [
      "Universal starting rating. No belt seeding. Weight is normalized into the exchange so heavier athletes get a small phantom-ELO offset (+50 per IBJJF division gap).",
      "Submission-only. Tap or don't. Draws cost ELO for both fighters; equal matches get the harshest Pressure Score penalty.",
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
      "Spotted a wrong result, a dispute that wasn't resolved, or an opponent breaking the rules? Send a feedback note from Settings, Feedback.",
      "For urgent issues (safety, abuse, account compromise), email support@elorated.com with the match ID.",
    ],
  },
];

export default function SettingsHelpScreen() {
  return (
    <>
      <AppHeader title="Help & Support" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 16 }}
      >
        {HELP_SECTIONS.map((section) => (
          <HelpPlate key={section.title} section={section} />
        ))}
      </PageContainer>
    </>
  );
}

function HelpPlate({ section }: { section: HelpSection }) {
  return (
    <Plate>
      <Text className="font-heading text-[16px] text-ink uppercase tracking-caps mb-3">
        {section.title}
      </Text>
      <View className="gap-3">
        {section.paragraphs.map((paragraph, index) => (
          <Text
            key={index}
            className="font-body text-[12px] text-ink-2 leading-relaxed"
          >
            {paragraph}
          </Text>
        ))}
      </View>
    </Plate>
  );
}
