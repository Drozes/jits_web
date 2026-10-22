import * as React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { typeSize } from "@/lib/typography";
import { AlertTriangle } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAmber } from "@/components/match-detail/use-amber";
import { useDisputeSubmit, type DisputeTimekeeperMode } from "@/lib/match-flow/use-dispute-submit";
import { Button } from "@/components/ui/elo-system/button";

interface DisputeFormProps {
  matchId: string;
  /**
   * Timekeeper mode only (PM29; the confirm step passes it): the edit count
   * of the result on screen, and a re-read of the match. Omitted: the shipped
   * form, exactly.
   */
  timekeeperMode?: DisputeTimekeeperMode;
  onCancel: () => void;
  onSubmitted: () => void;
  /** The 24 h dispute window had already closed (hint dispute_window_closed). */
  onWindowClosed?: () => void;
}

/**
 * Dispute reason input + submit. Surfaced from the confirm step when
 * the user taps "Dispute result". Reason is optional per the BE spec.
 *
 * The body says what a dispute actually does, per the BE: it flags the
 * match `disputed` and changes no rating; only an admin (service-role
 * `resolve_dispute`) can uphold, overturn or void it.
 *
 * ELO design system: meta heading + amber warning glyph (a dispute is
 * pressure, not a loss) + textarea with hairline border + Signal Red
 * primary cta and underlined back.
 *
 * The submit, and timekeeper mode's honest press (`timekeeperMode`, PM29:
 * bounded, no DomainError message, moved on closes the form, TK-RC4 once per
 * edit), live in `useDisputeSubmit`; this file is the view and the typed
 * reason.
 */
export function DisputeForm({ matchId, timekeeperMode, onCancel, onSubmitted, onWindowClosed }: DisputeFormProps) {
  const tokens = useThemedTokens();
  const amberIcon = useAmber().icon;
  const [reason, setReason] = React.useState("");
  const { submitting, submit } = useDisputeSubmit({ matchId, timekeeperMode, onCancel, onSubmitted, onWindowClosed });

  return (
    <View className="gap-4 px-1 py-4">
      <View className="items-center gap-2">
        <AlertTriangle size={28} color={amberIcon} />
        <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
          Dispute Result
        </Text>
        <Text className="text-center font-body text-body text-ink-2">
          Wrong winner, wrong submission, or it never happened? Tell us. An admin reviews
          every dispute; ratings stay as recorded until then, and your opponent will see it
          was disputed.
        </Text>
      </View>

      <TextInput
        testID="dispute-reason"
        accessibilityLabel="What went wrong?"
        placeholder="What went wrong? (optional)"
        placeholderTextColor={tokens.textTertiary}
        value={reason}
        onChangeText={setReason}
        multiline
        textAlignVertical="top"
        className="h-24 rounded-sm border border-hairline-strong bg-surface-3 px-3 py-2 font-body text-ink"
        style={typeSize("body")}
      />

      <Button
        testID="dispute-submit"
        label={submitting ? "Submitting..." : "Submit Dispute"}
        height={44}
        disabled={submitting}
        onPress={() => void submit(reason)}
      />

      <Pressable
        testID="dispute-back"
        accessibilityRole="button"
        onPress={onCancel}
        disabled={submitting}
        className="items-center py-2 active:opacity-70"
        hitSlop={8}
      >
        <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l underline">
          Back
        </Text>
      </Pressable>
    </View>
  );
}
