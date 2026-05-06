import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Monitor, Moon, Palette, Settings, Sun, UserPen } from "lucide-react-native";
import { useAuth } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useThemePreference, type ThemePreference } from "@/lib/theme";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function SettingsRow({
  icon,
  label,
  labelClassName,
  onPress,
}: {
  icon?: React.ReactNode;
  label: string;
  labelClassName?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-3 h-10 rounded-lg active:bg-muted/60"
    >
      {icon ? <View className="mr-3">{icon}</View> : null}
      <Text className={`text-sm font-medium ${labelClassName ?? "text-foreground"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

const THEME_OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

function ThemeSwitcherRow({ onSelect }: { onSelect: (pref: ThemePreference) => void }) {
  const { resolved } = useThemePreference();
  const [stored, setStored] = React.useState<ThemePreference>("system");
  const tokens = useThemedTokens();

  React.useEffect(() => {
    (async () => {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const val = await AsyncStorage.getItem("elo-rated-theme-preference");
      if (val === "light" || val === "dark" || val === "system") setStored(val);
    })();
  }, [resolved]);

  return (
    <View className="flex-row items-center justify-between px-3 h-10">
      <View className="flex-row items-center">
        <View className="mr-3">
          <Palette size={16} className="text-foreground" />
        </View>
        <Text className="text-sm font-medium text-foreground">Theme</Text>
      </View>
      <View className="flex-row rounded-lg overflow-hidden border border-border">
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => {
          const active = stored === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setStored(value);
                onSelect(value);
              }}
              className={`flex-row items-center px-2.5 py-1.5 ${active ? "bg-muted" : ""}`}
            >
              <Icon size={14} color={active ? tokens.foreground : tokens.mutedForeground} />
              <Text
                className={`text-xs ml-1 ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AccountSection() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { setPreference } = useThemePreference();

  return (
    <View>
      <Separator className="mb-4" />
      <Card>
        <CardContent className="p-4">
          <Text className="text-base font-heading text-foreground mb-3">Account</Text>
          <View className="gap-1">
            <ThemeSwitcherRow onSelect={setPreference} />
            <SettingsRow
              icon={<UserPen size={16} className="text-foreground" />}
              label="Edit Profile"
              onPress={() => Alert.alert("Coming soon", "Profile editing coming soon.")}
            />
            <SettingsRow
              icon={<Settings size={16} className="text-foreground" />}
              label="Settings & Privacy"
              onPress={() => router.push("/(app)/settings")}
            />
            <SettingsRow
              label="Sign Out"
              labelClassName="text-destructive"
              onPress={async () => {
                await signOut();
              }}
            />
          </View>
        </CardContent>
      </Card>
    </View>
  );
}
