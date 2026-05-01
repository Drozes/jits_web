import * as React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronRight, Mail } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";

const FAQ_ITEMS = [
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
      "Yes. Every match on JITS is ranked and affects your ELO rating. This keeps competition meaningful and ensures your record accurately reflects your performance on the mats.",
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

export default function SettingsHelpScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}
    >
      <Text className="text-2xl font-bold text-foreground">
        Help & Support
      </Text>

      <View className="gap-3">
        <Text className="text-base font-semibold text-foreground">
          Frequently Asked Questions
        </Text>
        <View className="gap-2">
          {FAQ_ITEMS.map((item) => (
            <FAQItem
              key={item.id}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </View>
      </View>

      <View className="border-t border-border pt-6 gap-3">
        <Text className="text-base font-semibold text-foreground">
          Need More Help?
        </Text>
        <Text className="text-sm text-muted-foreground">
          Have a question we didn't cover? Reach out to our support team.
        </Text>
        <EmailSupportButton />
      </View>
    </ScrollView>
  );
}

function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = React.useState(false);
  const tokens = useThemedTokens();

  return (
    <View className="rounded-lg border border-border bg-card overflow-hidden">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between px-4 py-3.5 active:bg-muted/40"
      >
        <Text className="flex-1 text-sm font-medium text-foreground pr-3">
          {question}
        </Text>
        {open ? (
          <ChevronDown size={16} color={tokens.mutedForeground} />
        ) : (
          <ChevronRight size={16} color={tokens.mutedForeground} />
        )}
      </Pressable>
      {open && (
        <View className="px-4 pb-4 pt-1">
          <Text className="text-sm leading-relaxed text-muted-foreground">
            {answer}
          </Text>
        </View>
      )}
    </View>
  );
}

function EmailSupportButton() {
  const handlePress = React.useCallback(async () => {
    const url = "mailto:support@elorated.com";
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  }, []);

  return (
    <Pressable
      onPress={handlePress}
      className="self-start flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2.5 active:opacity-90"
    >
      <Mail size={16} color="#ffffff" />
      <Text className="text-sm font-medium text-primary-foreground">
        Email Support
      </Text>
    </Pressable>
  );
}
