import { View, Text, Image } from "react-native";
import { cn } from "@/lib/cn";

interface Avatar32Props {
  name: string;
  photoUrl?: string | null;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const first = parts[0][0]?.toUpperCase() ?? "";
  const last = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${first}·${last}`;
}

const BASE_CLASS =
  "w-8 h-8 rounded-xs border border-hairline-strong items-center justify-center overflow-hidden";

export function Avatar32({ name, photoUrl, className }: Avatar32Props) {
  if (photoUrl) {
    return (
      <View className={cn(BASE_CLASS, className)}>
        <Image
          source={{ uri: photoUrl }}
          accessibilityLabel={name}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View
      className={cn(BASE_CLASS, "bg-surface-4", className)}
      accessibilityLabel={name}
    >
      <Text className="font-mono-bold text-[10px] text-ink tracking-caps-l">
        {getInitials(name)}
      </Text>
    </View>
  );
}
