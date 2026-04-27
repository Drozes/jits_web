import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

export default function SessionJoinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Session Join</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>session: {id}</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, join wizard comes in Phase 3)
      </Text>
    </View>
  );
}
