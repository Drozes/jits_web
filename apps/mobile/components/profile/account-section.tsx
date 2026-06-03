import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Monitor, Moon, Palette, Settings, Sun, UserPen } from "lucide-react-native";
import { useAuth } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useThemePreference, type ThemePreference } from "@/lib/theme";
import { Plate, MetaTag } from "@/components/ui/elo-system";
import { cn } from "@/lib/cn";

function SettingsRow({
  icon,
  label,
  destructive,
  onPress,
}: {
  icon?: React.ReactNode;
  label: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center px-4 h-12 border-t border-hairline-faint active:bg-surface-4"
    >
      {icon ? <View className="mr-3">{icon}</View> : null}
      <Text
        className={cn(
          "font-heading text-[12px] uppercase tracking-caps",
          destructive ? "text-cta" : "text-ink",
        )}
      >
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
    <View className="flex-row items-center justify-between px-4 h-12">
      <View className="flex-row items-center">
        <View className="mr-3">
          <Palette size={16} color={tokens.textPrimary} />
        </View>
        <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">Theme</Text>
      </View>
      <View className="flex-row rounded-xs overflow-hidden border border-hairline-strong">
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => {
          const active = stored === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setStored(value);
                onSelect(value);
              }}
              hitSlop={{ top: 10, bottom: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`${label} theme`}
              accessibilityState={{ selected: active }}
              className={cn(
                "flex-row items-center px-2.5 py-1.5 active:opacity-70",
                active ? "bg-surface-4" : "bg-surface-3",
              )}
            >
              <View pointerEvents="none">
                <Icon size={12} color={active ? tokens.textPrimary : tokens.textTertiary} />
              </View>
              <Text
                className={cn(
                  "font-mono-bold text-[10px] ml-1 uppercase tracking-caps-l",
                  active ? "text-ink" : "text-ink-3",
                )}
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
  const tokens = useThemedTokens();
  const { setPreference } = useThemePreference();

  return (
    <View className="gap-3">
      <MetaTag>Account</MetaTag>
      <Plate className="p-0 overflow-hidden">
        <ThemeSwitcherRow onSelect={setPreference} />
        <SettingsRow
          icon={<UserPen size={16} color={tokens.textPrimary} />}
          label="Edit Profile"
          onPress={() => Alert.alert("Coming soon", "Profile editing coming soon.")}
        />
        <SettingsRow
          icon={<Settings size={16} color={tokens.textPrimary} />}
          label="Settings & Privacy"
          onPress={() => router.push("/(app)/settings")}
        />
        <SettingsRow
          label="Sign Out"
          destructive
          onPress={async () => {
            await signOut();
          }}
        />
      </Plate>
    </View>
  );
}
