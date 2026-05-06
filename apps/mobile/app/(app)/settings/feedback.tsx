import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/lib/auth/hooks";
import { supabase } from "@/lib/supabase/client";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type Category = "bug" | "feature" | "general";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature Request" },
  { value: "general", label: "General Feedback" },
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
    // `apps/web/app/(app)/settings/feedback/feedback-form.tsx`.
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

  if (submitted) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8 gap-6">
        <Text className="text-3xl">Thank you!</Text>
        <Text className="text-sm text-muted-foreground text-center">
          Your feedback helps us improve ELO RATED.
        </Text>
        <Button variant="outline" onPress={reset}>
          Submit More Feedback
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="text-2xl font-heading text-foreground">
            Send Feedback
          </Text>
          <Text className="text-sm text-muted-foreground">
            Found a bug or have an idea? We read every submission.
          </Text>
        </View>

        <View className="gap-2">
          <Label>Category</Label>
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map(({ value, label }) => {
              const selected = category === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setCategory(value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5",
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-transparent",
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm font-medium",
                      selected
                        ? "text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <Label>Message</Label>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tell us what you think..."
            placeholderTextColor={tokens.mutedForeground}
            multiline
            maxLength={MAX_LEN}
            textAlignVertical="top"
            className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            style={{ minHeight: 128 }}
          />
          <Text
            className={cn(
              "text-xs text-right",
              charCount > MAX_LEN
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {charCount}/{MAX_LEN}
          </Text>
        </View>

        <Button
          onPress={handleSubmit}
          disabled={!isValid || submitting}
          className="w-full"
        >
          {submitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
