import * as React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { disputeMatchResult } from "@jits/shared/api/mutations";
import { cn } from "@/lib/cn";

interface DisputeFormProps {
  matchId: string;
  onCancel: () => void;
  onSubmitted: () => void;
}

/**
 * Dispute reason input + submit. Surfaced from the confirm step when
 * the user taps "Dispute result". Reason is optional per the BE spec.
 *
 * ELO design system: meta heading + Signal Red warning glyph + textarea
 * with hairline border + Signal Red primary cta and underlined back.
 */
export function DisputeForm({ matchId, onCancel, onSubmitted }: DisputeFormProps) {
  const tokens = useThemedTokens();
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    const res = await disputeMatchResult(supabase, matchId, reason || undefined);
    if (!res.ok) {
      setSubmitting(false);
      toast.error({ text1: "Couldn't dispute", description: res.error.message });
      return;
    }
    onSubmitted();
  }

  return (
    <View className="gap-4 px-1 py-4">
      <View className="items-center gap-2">
        <AlertTriangle size={28} color={tokens.stateNegative} />
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Dispute Result
        </Text>
        <Text className="text-center font-body text-[13px] text-ink-2">
          Tell us what happened. A reviewer will follow up.
        </Text>
      </View>

      <TextInput
        placeholder="Reason (optional)"
        placeholderTextColor={tokens.textTertiary}
        value={reason}
        onChangeText={setReason}
        multiline
        textAlignVertical="top"
        className="h-24 rounded-sm border border-hairline-strong bg-surface-3 px-3 py-2 font-body text-[13px] text-ink"
      />

      <Pressable
        accessibilityRole="button"
        onPress={handleSubmit}
        disabled={submitting}
        className={cn(
          "bg-cta items-center justify-center py-3 rounded-sm active:bg-cta-hover",
          submitting && "opacity-50",
        )}
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          {submitting ? "Submitting..." : "Submit Dispute"}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        disabled={submitting}
        className="items-center py-2"
      >
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l underline">
          Back
        </Text>
      </Pressable>
    </View>
  );
}
