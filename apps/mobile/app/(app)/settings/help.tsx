import { Text, View } from "react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";

/**
 * G4 Help & Support. Static 4-plate layout per wireframe lines 1653-1680,
 * structured like apps/web/app/(app)/settings/help/page.tsx. Each plate has an
 * h2 heading + lede paragraph(s). The copy deliberately diverges from web on
 * how to get a match: mobile has no gym sessions, only the Arena (jits-gewv).
 *
 * Every claim here is checked against the shipping app (jits-02vo.10), so
 * change the copy when the behavior changes:
 *  - every match is ranked, no casual (jits-02vo.2, jr_be-ahn.1); practice
 *    match is Settings, PRACTICE MATCH and touches no match data;
 *  - 3 pending challenges out: `can_create_challenge()` and `CapPlate`;
 *  - accept goes to the face-off (`step-router` "weight"), where each athlete
 *    checks the other's weight and a flag holds the match (jits-02vo.6);
 *  - live: the header chip on tab roots (GO LIVE / LIVE menu), offline for a
 *    match and in the background, restored after (`use-arena-live.ts`);
 *  - leaving the confirm step counts as confirming (jits-02vo.7);
 *  - ELO: 1000 for everyone, +50 phantom per IBJJF division gap for the
 *    expected score only, submission or draw, draws cost both and the
 *    favorite more (`record_match_result`, `calculate_elo_stakes`);
 *  - footage: no download UI, recorded matches are in the Film Room.
 */
type HelpSection = {
  title: string;
  paragraphs: string[];
};

const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Getting Started",
    paragraphs: [
      "ELO RATED is a participation-only ranking platform. You find opponents in the Arena, roll, and the system handles your rating. Every match is ranked. To walk through one without touching your rating, try a Practice Match from Settings.",
      "Open the Arena tab and go live to join the lobby. Anyone else who is live can challenge you, and you can challenge them. You can have up to 3 challenges out at once.",
      "Once you're live you stay live across the whole app, on Home, Rankings and Profile too, and challenges reach you wherever you are. The chip in the header shows it: tap LIVE to open the Arena or go offline. While you're offline it reads GO LIVE, and one tap puts you live.",
      "You stay live until you go offline from the Arena or the header chip. A match takes you offline while you roll, and so does switching away from the app. You're put back live when you leave the match or come back to the app.",
      "A challenge arrives as a live prompt. Accept it and you both go straight to the face-off, so be on the mat together before you go live.",
      "At the face-off, each of you checks the other's weight. If a weight doesn't look right, flag it: the match can't start until that athlete re-weighs and you check the new weight, or you withdraw the flag.",
      "After the match, confirm the result or dispute it. If you leave without disputing, it counts as confirming, and the result locks automatically once the dispute window closes.",
    ],
  },
  {
    title: "How ELO Works",
    paragraphs: [
      "Universal starting rating. No belt seeding. Weight is normalized into the exchange so heavier athletes get a small phantom-ELO offset (+50 per IBJJF division gap).",
      "A win is by submission only. Tap or don't. Anything else is a draw, and draws cost ELO for both fighters, and the favorite on paper loses more.",
      "Wins, losses, and draws all move your number. Your number is your number.",
    ],
  },
  {
    title: "Match Footage & Privacy",
    paragraphs: [
      "You own your match footage. Your recorded matches are in the Film Room on your profile, where you can watch them back. Server-side retention on the free tier may be limited; access to your own data is not.",
      "Your profile and rating are public on the global ladder.",
    ],
  },
  {
    title: "Report a Problem",
    paragraphs: [
      "Spotted a wrong result, a dispute that wasn't resolved, or an opponent breaking the rules? Send a feedback note from Settings, Feedback.",
      "For urgent issues (safety, abuse, account compromise), email support@elorated.com with your opponent's name and the date of the match.",
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
