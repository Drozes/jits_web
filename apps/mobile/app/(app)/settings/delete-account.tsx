import * as React from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { typeSize } from "@/lib/typography";
import { supabase } from "@/lib/supabase/client";
import { DELETE_CONFIRM_WORD, deleteAccount, isDeleteConfirmed } from "@/lib/account/delete-account";

const FAILED = "We couldn't delete your account. Check your connection and try again.";
const MATCH_LIVE = "Finish your match first. You can delete your account once it ends.";
const CONFIRM = `Type ${DELETE_CONFIRM_WORD} exactly to confirm.`;
const SIGNED_OUT = "You're signed out. If your account still exists, sign in to delete it.";

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
    if (!result.ok && result.code === "not_authenticated") {
      // Terminal: the session is gone, or an earlier attempt already deleted
      // the account and its response was lost. Either way, sign out locally.
      await signOut();
      toast.error(SIGNED_OUT);
      router.replace("/login");
      return;
    }
    if (!result.ok) {
      setDeleting(false);
      toast.error(
        result.code === "match_in_progress" ? MATCH_LIVE : result.code === "confirm_required" ? CONFIRM : FAILED,
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
          <Text className="font-heading text-title text-ink uppercase tracking-caps">Delete account</Text>
          <Text className="font-body text-callout text-ink leading-relaxed">
            This permanently deletes your profile, photos and ELO. Your past matches stay in your opponents&apos; history as a deleted athlete. This can&apos;t be undone.
          </Text>
          <Text className="font-body text-body text-ink-2 leading-relaxed">
            Your name, profile photo, avatar, current weight, birthday, Instagram, friends, open invites,
            push devices, and the messages and chat photos you sent are erased, and you leave the
            rankings. Match records (including weigh-ins, videos and stills) stay with the matches they
            belong to, under a deleted athlete.
          </Text>
        </Plate>

        {step === "explain" ? (
          <Button label="Continue" onPress={() => setStep("confirm")} testID="delete-continue" />
        ) : (
          <ConfirmStep typed={typed} onChange={setTyped} deleting={deleting} onDelete={onDelete} />
        )}

        <Button variant="ghost" height={44} label="Keep my account" onPress={() => router.back()} disabled={deleting} />
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
      <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
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
        className="font-mono text-ink bg-surface-3 border border-hairline rounded-xs px-3 py-3"
        style={typeSize("subhead")}
      />
      <Button
        variant="destructive"
        testID="delete-submit"
        label={deleting ? "Deleting..." : "Delete account"}
        onPress={onDelete}
        disabled={!ready || deleting}
      />
    </View>
  );
}
