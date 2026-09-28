import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useFeatureFlags } from "@/lib/admin/use-feature-flags";
import { getShareCapabilities, type ShareCapabilities } from "@/lib/highlight-share";

/**
 * Admin > Feature flags. Lists every feature_flags row with a Switch that
 * toggles `admin_set_feature_flag` (optimistic, rolls back on error). The
 * Switch primitive reads useThemedTokens() for its track/thumb colors since RN
 * Switch can't take a className. Self-guards like the hub.
 */
export default function AdminFlagsScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const tokens = useThemedTokens();
  const { flags, isLoading, toggle } = useFeatureFlags();

  const handleToggle = React.useCallback(
    async (key: string, next: boolean) => {
      const errorMessage = await toggle(key, next);
      if (errorMessage) toast.error(errorMessage);
    },
    [toggle],
  );

  if (!authLoading && !isAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="Feature Flags" back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 16 }}>
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} />
          </View>
        ) : flags.length === 0 ? (
          <Plate>
            <Text className="font-body text-[13px] text-ink-3 leading-relaxed">
              No feature flags defined.
            </Text>
          </Plate>
        ) : (
          <Plate className="p-0 overflow-hidden">
            {flags.map((flag, idx) => (
              <View key={flag.key}>
                {idx > 0 ? <View className="h-px bg-hairline-faint" /> : null}
                <FlagRow
                  flagKey={flag.key}
                  description={flag.description}
                  value={flag.enabled}
                  onToggle={(next) => handleToggle(flag.key, next)}
                />
              </View>
            ))}
          </Plate>
        )}
        <ShareDiagnosticsRow />
      </PageContainer>
    </>
  );
}

function FlagRow({
  flagKey,
  description,
  value,
  onToggle,
}: {
  flagKey: string;
  description: string | null;
  value: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onToggle(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-4"
    >
      <View className="flex-1 min-w-0">
        <Text className="font-mono text-[11px] text-ink mb-1">{flagKey}</Text>
        {description ? (
          <Text className="font-body text-[12px] text-ink-3 leading-snug">
            {description}
          </Text>
        ) : null}
      </View>
      {/* Presentational only: the wrapping Pressable is the sole toggle driver,
          so the Switch ignores touches (pointerEvents="none") and has no
          onValueChange. This prevents one tap firing setFeatureFlag twice. */}
      <Switch value={value} pointerEvents="none" />
    </Pressable>
  );
}

const present = (value: boolean) => (value ? "present" : "absent");

/**
 * The share funnel's native embedding in THIS binary (jr_be spec 014 section
 * 16.9): how an OTA's reach is confirmed on a field build.
 */
function formatShareDiagnostics(caps: ShareCapabilities): string {
  const instagram =
    caps.instagramDetected === null ? "not checked" : caps.instagramDetected ? "installed" : "not detected";
  return [
    `Reels module: ${present(caps.reelsModule)}`,
    `App ID: ${caps.facebookAppIdConfigured ? "set" : "unset"}`,
    `Instagram: ${instagram}`,
    `Share sheet: ${present(caps.shareSheet)}`,
    `Photos: ${present(caps.saveToPhotos)}`,
    `Clipboard: ${present(caps.clipboard)}`,
  ].join(" · ");
}

function ShareDiagnosticsRow() {
  const [caps, setCaps] = React.useState<ShareCapabilities | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    getShareCapabilities()
      .then((next) => {
        if (!cancelled) setCaps(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <Plate>
      <Text className="font-mono text-[11px] text-ink mb-1">Highlight share diagnostics</Text>
      <Text testID="share-diagnostics" className="font-body text-[12px] text-ink-3 leading-snug">
        {caps ? formatShareDiagnostics(caps) : "Checking…"}
      </Text>
    </Plate>
  );
}
