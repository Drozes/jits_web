import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { acceptSessionWaiver } from "@jits/shared/api/mutations";
import { cn } from "@/lib/cn";

const WAIVER_TEXT =
  "By using the JITS platform to arrange and participate in Brazilian Jiu-Jitsu matches, " +
  "you acknowledge and accept the inherent risks of grappling, including but not limited to " +
  "physical injury. You agree to hold the JITS platform, its creators, and operators harmless " +
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
      <Text className="text-center text-base font-semibold text-foreground">
        Liability Waiver
      </Text>
      <ScrollView
        className="max-h-72 rounded-md border border-border p-4"
        nestedScrollEnabled
      >
        <Text className="text-xs leading-relaxed text-muted-foreground">
          {WAIVER_TEXT}
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
        <Text className="flex-1 text-sm text-foreground">
          I have read and agree to this waiver
        </Text>
      </Pressable>

      <Button onPress={handleAccept} disabled={!agreed || loading}>
        {loading ? "Accepting..." : "Continue"}
      </Button>
    </View>
  );
}
