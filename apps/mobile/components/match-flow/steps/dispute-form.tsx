import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { disputeMatchResult } from "@jits/shared/api/mutations";

interface DisputeFormProps {
  matchId: string;
  onCancel: () => void;
  onSubmitted: () => void;
}

/**
 * Dispute reason input + submit. Surfaced from the confirm step when
 * the user taps "Dispute result". Reason is optional per the BE spec.
 */
export function DisputeForm({ matchId, onCancel, onSubmitted }: DisputeFormProps) {
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
      <View className="items-center gap-1">
        <AlertTriangle size={28} color="#f59e0b" />
        <Text className="text-lg font-heading text-foreground">Dispute Result</Text>
      </View>
      <Text className="text-center text-sm text-muted-foreground">
        Tell us what happened. A reviewer will follow up.
      </Text>
      <Input
        placeholder="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        multiline
        className="h-24 py-2"
      />
      <Button variant="destructive" onPress={handleSubmit} disabled={submitting} size="lg">
        {submitting ? "Submitting..." : "Submit Dispute"}
      </Button>
      <Pressable onPress={onCancel} disabled={submitting}>
        <Text className="text-center text-sm text-muted-foreground underline">Back</Text>
      </Pressable>
    </View>
  );
}
