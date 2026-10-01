/**
 * "Got a challenge code?" (jr_be spec 016, M5). Reachable signed out and
 * signed in. Stores the code as the pending invite (gateway `code`) and hands
 * over to `app/index.tsx`, which routes to signup, setup or the claim runner.
 * Typing never prompts for any permission.
 */
import * as React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { extractInviteFromText, formatInviteCode } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { CtaButton } from "@/components/auth/auth-buttons";
import { Plate } from "@/components/ui/elo-system";
import { makePendingInvite, savePendingInvite } from "@/lib/invites/pending-invite";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function InviteCodeScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    // Accept a pasted link or message too, not just the bare code.
    const found = extractInviteFromText(value);
    const pending = found
      ? makePendingInvite(found, "token" in found ? "paste" : "code")
      : null;
    if (!pending) {
      setError("Enter the 6-character code from your training partner.");
      return;
    }
    setSaving(true);
    await savePendingInvite(pending);
    setSaving(false);
    router.replace("/");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} className="bg-surface">
      <AppHeader title="Challenge Code" back backFallback="/" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <Text className="font-body text-[14px] text-ink-2 leading-6">
          Type the code your training partner is showing you, or paste their link.
        </Text>
        <Plate className="gap-4">
          <TextInput
            testID="invite-code-input"
            accessibilityLabel="Challenge code"
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setError(null);
            }}
            placeholder="K7Q-4M2"
            placeholderTextColor={tokens.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={200}
            onSubmitEditing={() => void submit()}
            className="rounded-sm border border-hairline-strong bg-surface-3 px-4 py-4 text-center font-mono text-[28px] tracking-[6px] text-ink"
          />
          {error ? (
            <Text accessibilityRole="alert" className="font-body text-[13px] text-cta">
              {error}
            </Text>
          ) : null}
          {/* Slot: the native slice mounts <PasteInviteButton /> here. */}
          <CtaButton label={saving ? "Checking..." : "Continue"} onPress={() => void submit()} disabled={saving || !value.trim()} />
        </Plate>
        <View>
          <Text className="font-body text-[12px] text-ink-3 text-center">
            Codes look like {formatInviteCode("K7Q4M2")} and last 30 minutes.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
