import { ScrollView, Text, View } from "react-native";

export default function SettingsVideoScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
    >
      <Text className="text-2xl font-heading text-foreground">Video Settings</Text>
      <View className="rounded-lg border border-border bg-card p-4">
        <Text className="text-sm text-muted-foreground leading-relaxed">
          Video recording settings are coming soon. Your matches are
          automatically recorded when camera access is granted.
        </Text>
      </View>
    </ScrollView>
  );
}
