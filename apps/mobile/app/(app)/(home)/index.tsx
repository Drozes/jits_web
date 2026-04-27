import { Text, View } from "react-native";

export default function DashboardScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Dashboard</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, stats and sessions come in Phase 3)
      </Text>
    </View>
  );
}
