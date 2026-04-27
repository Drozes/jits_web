import { Text, View } from "react-native";
import { getInitials } from "@jits/shared/utils";

export default function Index() {
  const initials = getInitials("JITS Demo User");
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold">@jits/shared works</Text>
      <Text className="mt-2 text-base text-neutral-500">
        Initials: {initials}
      </Text>
    </View>
  );
}
