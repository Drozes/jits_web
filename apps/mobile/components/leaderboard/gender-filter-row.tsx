import { View } from "react-native";
import { Chip } from "@/components/ui/elo-system";

export type GenderFilter = "all" | "male" | "female";

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

/**
 * Gender filter rendered as ELO chips. Sits inside the chip strip on the
 * Rankings screen alongside the Fighters/Gyms toggle.
 */
export function GenderFilterRow({
  current,
  onSelect,
}: {
  current: GenderFilter;
  onSelect: (f: GenderFilter) => void;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {GENDER_OPTIONS.map((opt) => (
        <Chip
          key={opt.value}
          active={current === opt.value}
          onPress={() => onSelect(opt.value)}
        >
          {opt.label}
        </Chip>
      ))}
    </View>
  );
}
