import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate, Chip } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type Category = "bug" | "feature" | "general";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "BUG" },
  { value: "feature", label: "FEATURE" },
  { value: "general", label: "GENERAL" },
];

const MIN_LEN = 10;
const MAX_LEN = 2000;

export default function SettingsFeedbackScreen() {
  const { user } = useAuth();
  const tokens = useThemedTokens();
  const [category, setCategory] = React.useState<Category>("general");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const charCount = message.length;
  const isValid = charCount >= MIN_LEN && charCount <= MAX_LEN;

  const handleSubmit = React.useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);

    // The `feedback` table isn't in the generated `Database` type yet; cast to
    // `unknown` to bypass the schema check. Keep the row shape aligned with
    // apps/web/app/(app)/settings/feedback/feedback-form.tsx.
    const { error } = await (
      supabase.from("feedback" as never) as unknown as {
        insert: (row: {
          athlete_id: string | null;
          category: Category;
          message: string;
        }) => Promise<{ error: { message: string } | null }>;
      }
    ).insert({
      athlete_id: user?.id ?? null,
      category,
      message,
    });

    setSubmitting(false);

    if (error) {
      toast.error("Could not submit feedback. Please try again.");
      return;
    }

    setSubmitted(true);
  }, [category, isValid, message, submitting, user?.id]);

  const reset = React.useCallback(() => {
    setMessage("");
    setCategory("general");
    setSubmitted(false);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AppHeader title="Feedback" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {submitted ? (
          <SuccessPlate onReset={reset} />
        ) : (
          <>
            <Text className="font-body text-[12px] text-ink-2 leading-relaxed">
              Found a bug or have an idea? We read every submission.
            </Text>

            <View className="gap-2">
              <FieldLabel>CATEGORY</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORIES.map(({ value, label }) => (
                  <Chip
                    key={value}
                    active={category === value}
                    onPress={() => setCategory(value)}
                  >
                    {label}
                  </Chip>
                ))}
              </View>
            </View>

            <View className="gap-2">
              <FieldLabel>MESSAGE</FieldLabel>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us what you think..."
                placeholderTextColor={tokens.textTertiary}
                multiline
                maxLength={MAX_LEN}
                textAlignVertical="top"
                className="font-mono text-[12px] text-ink bg-surface-3 border border-hairline rounded-xs p-3"
                style={{ minHeight: 144 }}
              />
              <Text
                className={cn(
                  "font-mono text-[10px] text-right uppercase tracking-caps-l",
                  charCount > MAX_LEN ? "text-negative" : "text-ink-3",
                )}
              >
                {charCount}/{MAX_LEN}
              </Text>
            </View>

            <SubmitButton
              disabled={!isValid || submitting}
              onPress={handleSubmit}
              label={submitting ? "SUBMITTING..." : "SUBMIT FEEDBACK"}
            />
          </>
        )}
      </PageContainer>
    </KeyboardAvoidingView>
  );
}

function SuccessPlate({ onReset }: { onReset: () => void }) {
  return (
    <Plate>
      <View className="items-center gap-4 py-6">
        <Text className="font-heading text-[24px] text-ink uppercase tracking-caps">
          THANK YOU
        </Text>
        <Text className="font-body text-[12px] text-ink-2 text-center leading-relaxed">
          Your feedback helps us improve ELO RATED.
        </Text>
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          hitSlop={10}
          className="px-4 py-2 rounded-sm border border-hairline-strong active:bg-surface-4"
        >
          <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
            SUBMIT MORE FEEDBACK
          </Text>
        </Pressable>
      </View>
    </Plate>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
      {children}
    </Text>
  );
}

function SubmitButton({
  disabled,
  onPress,
  label,
}: {
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "w-full items-center justify-center rounded-sm px-4 py-3",
        disabled ? "bg-cta opacity-50" : "bg-cta active:bg-cta-hover",
      )}
    >
      <Text className="font-heading text-[14px] text-ink-on-cta uppercase tracking-caps">
        {label}
      </Text>
    </Pressable>
  );
}
