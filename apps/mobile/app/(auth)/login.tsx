import { Text, View } from "react-native";

export default function LoginScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Login</Text>
      <Text style={{ marginTop: 4, color: "#737373" }}>
        (stub, auth flow comes in Phase 2)
      </Text>
    </View>
  );
}
