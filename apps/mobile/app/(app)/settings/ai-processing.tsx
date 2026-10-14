/**
 * Settings, AI processing (App Review 5.1.2(i), jits-rog5.11): whether the
 * athlete allowed their match video to go to Google Gemini and stills to
 * OpenAI, and when, with the same words the "Before you film" prompt showed.
 * Read-only: withdrawing in the app is a follow-up; until then the policy's
 * email route (Privacy Policy section 7) is named here.
 */
import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { legalHref } from "@/lib/legal/legal-copy";
import { useAiConsent } from "@/lib/moderation/ai-consent";
import { AI_CONSENT_COPY, aiConsentStatus } from "@/lib/moderation/moderation-copy";

export default function AiProcessingScreen() {
  const { consentAt } = useAiConsent();
  return (
    <>
      <AppHeader title={AI_CONSENT_COPY.settingsTitle} back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 16 }}>
        <Plate className="p-0 overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">{AI_CONSENT_COPY.statusLabel}</Text>
            <Text testID="ai-consent-status" className="font-mono-medium tabular-nums text-small text-ink uppercase tracking-caps-l">
              {aiConsentStatus(consentAt)}
            </Text>
          </View>
        </Plate>
        <Plate className="gap-3">
          <Text accessibilityRole="header" className="font-heading text-subhead text-ink uppercase tracking-caps">
            {AI_CONSENT_COPY.title}
          </Text>
          <Text className="font-body text-small text-ink-2 leading-relaxed">{AI_CONSENT_COPY.body}</Text>
          {consentAt ? null : (
            <Text className="font-body text-small text-ink-2 leading-relaxed">{AI_CONSENT_COPY.settingsNotGivenHint}</Text>
          )}
          <Text className="font-body text-small text-ink-2 leading-relaxed">{AI_CONSENT_COPY.withdrawNote}</Text>
          <Link href={legalHref("privacy", undefined, "4")} asChild>
            <Pressable testID="ai-processing-privacy" accessibilityRole="link" hitSlop={8} className="self-start">
              <Text className="font-body text-small text-ink underline">{AI_CONSENT_COPY.privacyLink}</Text>
            </Pressable>
          </Link>
        </Plate>
      </PageContainer>
    </>
  );
}
