import { Text, View } from "react-native";

export default function LeaderboardScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Rankings</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, leaderboard comes in Phase 3)
      </Text>
    </View>
  );
}
