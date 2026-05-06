import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";

export type GenderFilter = "all" | "male" | "female";

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function GenderFilterRow({
  current,
  onSelect,
}: {
  current: GenderFilter;
  onSelect: (f: GenderFilter) => void;
}) {
  return (
    <View className="flex-row justify-center gap-1.5 mt-3">
      {GENDER_OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onSelect(opt.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5",
            current === opt.value ? "bg-primary" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-medium",
              current === opt.value
                ? "text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
