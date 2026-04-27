import { ScrollView, Text, View } from "react-native";

export default function SettingsVideoScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
    >
      <Text className="text-2xl font-bold text-foreground">Video Settings</Text>
      <View className="rounded-lg border border-border bg-card p-4">
        <Text className="text-sm text-muted-foreground leading-relaxed">
          Video recording settings will be available here. Match recordings can
          be configured for automatic or manual capture.
        </Text>
      </View>
    </ScrollView>
  );
}
