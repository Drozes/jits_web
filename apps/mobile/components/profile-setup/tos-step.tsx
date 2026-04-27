import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { TOS_TEXT } from "@jits/shared/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface TosStepProps {
  onAccept: () => void | Promise<void>;
  submittingExternal?: boolean;
}

/**
 * Native port of `apps/web/app/profile/setup/tos-step.tsx`. Renders the
 * shared TOS body in a scroll view with a checkbox + Continue button. The
 * actual `waiver_acknowledgements` insert lives in `useSetupSubmit.acceptTos`.
 */
export function TosStep({ onAccept, submittingExternal }: TosStepProps) {
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const isBusy = submitting || submittingExternal;

  async function handleContinue() {
    setSubmitting(true);
    try {
      await onAccept();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <ScrollView
        className="max-h-80 rounded-md border border-border p-4"
        nestedScrollEnabled
      >
        <Text className="text-xs leading-relaxed text-muted-foreground">
          {TOS_TEXT}
        </Text>
      </ScrollView>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => setAgreed((v) => !v)}
        className="flex-row items-start gap-2"
      >
        <View
          className={cn(
            "mt-0.5 h-4 w-4 items-center justify-center rounded border border-input",
            agreed && "bg-primary",
          )}
        >
          {agreed && (
            <Text className="text-[10px] font-bold text-primary-foreground">
              {"✓"}
            </Text>
          )}
        </View>
        <Text className="text-sm text-foreground flex-1">
          I have read and agree to the Terms of Service
        </Text>
      </Pressable>

      <Button onPress={handleContinue} disabled={!agreed || isBusy}>
        {isBusy ? "Saving..." : "Continue"}
      </Button>
    </View>
  );
}
