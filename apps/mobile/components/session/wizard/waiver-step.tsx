import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { toast } from "@/components/ui/toast";
import { Plate } from "@/components/ui/elo-system";
import { supabase } from "@/lib/supabase/client";
import { acceptSessionWaiver } from "@jits/shared/api/mutations";
import { cn } from "@/lib/cn";

const WAIVER_TEXT =
  "By using the ELO RATED platform to arrange and participate in Brazilian Jiu-Jitsu matches, " +
  "you acknowledge and accept the inherent risks of grappling, including but not limited to " +
  "physical injury. You agree to hold the ELO RATED platform, its creators, and operators harmless " +
  "from any claims arising from your participation. This waiver does not replace any waiver " +
  "required by your training facility.\n\n" +
  "You confirm that you are in adequate physical condition to participate in grappling activities " +
  "and that you have not been advised by a medical professional to refrain from such activities. " +
  "You understand that it is your responsibility to maintain appropriate health and sports insurance.";

interface WaiverStepProps {
  sessionId: string;
  waiverId: string;
  onNext: () => void;
}

/**
 * Native port of `apps/web/app/(app)/session/[id]/join/steps/waiver-step.tsx`.
 *
 * ELO design system: wireframe C2 (lines 972-989). Scrollable Plate holds the
 * TOS body text (font-body, ink-2) with a heading; a checkbox row + primary
 * "I Acknowledge" cta sits below.
 *
 * Calls `acceptSessionWaiver` which inserts into `waiver_acknowledgements`.
 * Errors surface via toast so the user can retry.
 */
export function WaiverStep({ sessionId, waiverId, onNext }: WaiverStepProps) {
  const [agreed, setAgreed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleAccept() {
    setLoading(true);
    const result = await acceptSessionWaiver(supabase, { sessionId, waiverId });
    setLoading(false);
    if (!result.ok) {
      toast.error({ text1: "Could not accept waiver", description: result.error.message });
      return;
    }
    onNext();
  }

  return (
    <View className="gap-4">
      <Plate className="max-h-[360px]">
        <Text className="font-heading text-[16px] text-ink mb-3">
          ELO RATED Liability Acknowledgement
        </Text>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <Text className="font-body text-[13px] text-ink-2 leading-[22px]">
            {WAIVER_TEXT}
          </Text>
        </ScrollView>
      </Plate>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => setAgreed((v) => !v)}
        className="flex-row items-start gap-2"
      >
        <View
          className={cn(
            "mt-0.5 h-4 w-4 items-center justify-center rounded-xs border",
            agreed ? "bg-cta border-cta" : "border-hairline-strong bg-surface-3",
          )}
        >
          {agreed && (
            <Text className="font-mono-bold text-[10px] text-ink-on-cta">
              {"✓"}
            </Text>
          )}
        </View>
        <Text className="flex-1 font-body text-[13px] text-ink-2">
          I have read and agree to this waiver
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={handleAccept}
        disabled={!agreed || loading}
        className={cn(
          "bg-cta items-center justify-center py-3 rounded-sm",
          (!agreed || loading) && "opacity-50",
          "active:bg-cta-hover",
        )}
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          {loading ? "Accepting..." : "I Acknowledge"}
        </Text>
      </Pressable>
    </View>
  );
}
