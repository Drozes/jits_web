import { Text, View } from "react-native";

export default function SettingsHelpScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Help</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, help content comes in Phase 3)
      </Text>
    </View>
  );
}
