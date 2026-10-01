import * as React from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { DELETE_CONFIRM_WORD, deleteAccount, isDeleteConfirmed } from "@/lib/account/delete-account";
import { CtaButton, TertiaryButton } from "@/components/auth/auth-buttons";

/**
 * Settings > Delete account (jits-b3js.10). Two steps so it can never happen
 * by accident: (1) read what is deleted and tap Continue, (2) type DELETE and
 * tap Delete account. On success the local session is cleared and the app
 * returns to login.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [step, setStep] = React.useState<"explain" | "confirm">("explain");
  const [typed, setTyped] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const onDelete = React.useCallback(async () => {
    if (deleting || !isDeleteConfirmed(typed)) return;
    setDeleting(true);
    const result = await deleteAccount(supabase);
    if (!result.ok) {
      setDeleting(false);
      toast.error(
        result.code === "not_authenticated"
          ? "Your session expired. Sign in again, then delete your account."
          : "We couldn't delete your account. Check your connection and try again.",
      );
      return;
    }
    await signOut();
    toast.success("Your account was deleted.");
    router.replace("/login");
  }, [deleting, typed, signOut, router]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AppHeader title="Delete account" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Plate className="gap-3">
          <Text className="font-heading text-[18px] text-ink uppercase tracking-caps">Delete account</Text>
          <Text className="font-body text-[14px] text-ink leading-relaxed">
            This permanently deletes your profile, matches and ELO. This can&apos;t be undone.
          </Text>
          <Text className="font-body text-[13px] text-ink-2 leading-relaxed">
            Your name, photo, weight, birthday, Instagram, push devices and messages are erased and you
            leave the rankings. Opponents keep their own results, shown against a deleted athlete.
          </Text>
        </Plate>

        {step === "explain" ? (
          <CtaButton label="Continue" onPress={() => setStep("confirm")} testID="delete-continue" />
        ) : (
          <ConfirmStep typed={typed} onChange={setTyped} deleting={deleting} onDelete={onDelete} />
        )}

        <TertiaryButton label="Keep my account" onPress={() => router.back()} disabled={deleting} />
      </PageContainer>
    </KeyboardAvoidingView>
  );
}

function ConfirmStep({
  typed,
  onChange,
  deleting,
  onDelete,
}: {
  typed: string;
  onChange: (v: string) => void;
  deleting: boolean;
  onDelete: () => void;
}) {
  const tokens = useThemedTokens();
  const ready = isDeleteConfirmed(typed);
  return (
    <View className="gap-3">
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        Type {DELETE_CONFIRM_WORD} to confirm
      </Text>
      <TextInput
        testID="delete-confirm-input"
        value={typed}
        onChangeText={onChange}
        placeholder={DELETE_CONFIRM_WORD}
        placeholderTextColor={tokens.textTertiary}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!deleting}
        accessibilityLabel={`Type ${DELETE_CONFIRM_WORD} to confirm`}
        className="font-mono text-[16px] text-ink bg-surface-3 border border-hairline rounded-xs px-3 py-3"
      />
      <CtaButton
        testID="delete-submit"
        label={deleting ? "Deleting..." : "Delete account"}
        onPress={onDelete}
        disabled={!ready || deleting}
      />
    </View>
  );
}
