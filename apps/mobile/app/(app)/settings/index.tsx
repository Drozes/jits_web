import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function SettingsScreen() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Settings</Text>
      <Text style={{ color: "#737373" }}>
        (stub, settings come in Phase 3)
      </Text>

      {__DEV__ && (
        <View style={{ marginTop: 24, gap: 8 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: "#737373",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Developer
          </Text>
          <Link href="/(app)/settings/realtime-test" asChild>
            <Pressable
              style={{
                borderWidth: 1,
                borderColor: "#e5e5e5",
                borderRadius: 8,
                paddingVertical: 12,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600" }}>
                Realtime smoke test
              </Text>
              <Text style={{ fontSize: 12, color: "#737373", marginTop: 2 }}>
                Verify Supabase channels, presence, broadcast, postgres-changes
              </Text>
            </Pressable>
          </Link>
        </View>
      )}
    </View>
  );
}
