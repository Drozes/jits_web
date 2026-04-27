import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

export default function SessionMatchScreen() {
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Session Match</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>session: {id}</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>match: {matchId}</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, match wizard comes in Phase 3)
      </Text>
    </View>
  );
}
