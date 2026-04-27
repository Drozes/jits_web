import { Text, View } from "react-native";

export default function SettingsVideoScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Video Settings</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, video preferences come in Phase 3)
      </Text>
    </View>
  );
}
