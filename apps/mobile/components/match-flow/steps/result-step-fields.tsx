import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Handshake, Swords } from "lucide-react-native";
import { cn } from "@/lib/cn";

export interface ResultParticipant {
  id: string;
  displayName: string;
}

/** Submission/Draw segmented toggle. */
export function OutcomeToggle({
  value,
  onChange,
}: {
  value: "submission" | "draw" | null;
  onChange: (v: "submission" | "draw") => void;
}) {
  return (
    <View className="flex-row gap-2 rounded-xl bg-muted/50 p-1.5">
      {(["submission", "draw"] as const).map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            className={cn(
              "flex-1 flex-row items-center justify-center gap-2 rounded-lg py-3",
              active && opt === "submission" && "bg-primary",
              active && opt === "draw" && "bg-amber-500",
            )}
          >
            {opt === "submission" ? (
              <Swords size={16} color={active ? "white" : "#71717a"} />
            ) : (
              <Handshake size={16} color={active ? "white" : "#71717a"} />
            )}
            <Text
              className={cn(
                "text-sm font-semibold",
                active ? "text-white" : "text-muted-foreground",
              )}
            >
              {opt === "submission" ? "Submission" : "Draw"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-button winner picker. */
export function WinnerPicker({
  participants,
  winnerId,
  onChange,
}: {
  participants: ResultParticipant[];
  winnerId: string;
  onChange: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-muted-foreground">Who won?</Text>
      <View className="flex-row gap-2">
        {participants.map((p) => {
          const active = winnerId === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => onChange(p.id)}
              className={cn(
                "flex-1 rounded-xl border-2 p-3",
                active ? "border-primary bg-primary/5" : "border-muted",
              )}
            >
              <Text className="text-center text-sm font-semibold text-foreground" numberOfLines={1}>
                {p.displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
