/**
 * "Before you film" (App Review 5.1.2(i), jits-rog5.11): the explicit
 * permission before a match video goes to Google Gemini and stills to
 * OpenAI. A centered RN Modal like `GoLiveLocationSheet` (DESIGN.md "Inputs
 * and overlays": a blocking prompt that must be answered); the hardware back
 * answers "Not now". "Read the Privacy Policy" closes the prompt (unanswered,
 * so recording stays off) and opens the policy at section 4, Match video and
 * AI analysis; the athlete turns the toggle on again after reading.
 */
import * as React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/elo-system/button";
import { legalHref } from "@/lib/legal/legal-copy";
import { useModalAnimation } from "@/lib/motion";
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";

export interface AiConsentSheetProps {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onAllow: () => void;
  onNotNow: () => void;
  /** The privacy link was tapped: the host closes the prompt without an answer. */
  onDismiss: () => void;
}

export function AiConsentSheet({ visible, busy, error, onAllow, onNotNow, onDismiss }: AiConsentSheetProps) {
  const router = useRouter();
  const animationType = useModalAnimation("fade");
  const openPrivacy = () => {
    onDismiss();
    router.push(legalHref("privacy", undefined, "4"));
  };
  return (
    <Modal visible={visible} transparent animationType={animationType} onRequestClose={busy ? () => undefined : onNotNow}>
      <View className="flex-1 items-center justify-center bg-on-media-scrim px-6">
        <View testID="ai-consent-sheet" accessibilityViewIsModal className="w-full max-w-md gap-4 rounded-lg border border-hairline bg-surface-2 p-5">
          <Text accessibilityRole="header" className="font-heading text-title uppercase tracking-caps text-ink">
            {AI_CONSENT_COPY.title}
          </Text>
          <Text testID="ai-consent-body" className="font-body text-callout leading-6 text-ink">
            {AI_CONSENT_COPY.body}
          </Text>
          <Pressable testID="ai-consent-privacy" accessibilityRole="link" disabled={busy} onPress={openPrivacy} hitSlop={8} className="self-start">
            <Text className="font-body text-body text-ink underline">{AI_CONSENT_COPY.privacyLink}</Text>
          </Pressable>
          {error ? (
            <Text testID="ai-consent-error" accessibilityRole="alert" className="font-body text-small text-ink">
              {error}
            </Text>
          ) : null}
          <Button testID="ai-consent-allow" label={AI_CONSENT_COPY.allow} busy={busy} onPress={onAllow} />
          <Button testID="ai-consent-not-now" variant="ghost" height={44} label={AI_CONSENT_COPY.notNow} disabled={busy} onPress={onNotNow} />
        </View>
      </View>
    </Modal>
  );
}
