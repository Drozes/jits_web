import { Text, View } from "react-native";

export default function ProfileStatsScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Profile Stats</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, stats detail comes in Phase 3)
      </Text>
    </View>
  );
}
