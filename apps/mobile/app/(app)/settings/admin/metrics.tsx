import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/elo-system";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAdminMetrics } from "@/lib/admin/use-admin-metrics";

/**
 * Admin > Metrics. Platform-wide counters from `get_admin_metrics` grouped into
 * signups / activation funnel / matches / sessions. Self-guards like the hub.
 */
export default function AdminMetricsScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const tokens = useThemedTokens();
  const { metrics, isLoading, error, reload } = useAdminMetrics();

  if (!authLoading && !isAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="Metrics" back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 16 }}>
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} />
          </View>
        ) : error ? (
          <Plate variant="loss" className="gap-3">
            <Text className="font-body text-[13px] text-ink leading-relaxed">
              {error}
            </Text>
            <Button variant="outline" size="sm" onPress={reload}>
              Retry
            </Button>
          </Plate>
        ) : metrics ? (
          <>
            <MetricGroup
              heading="SIGNUPS"
              rows={[
                { label: "Today", value: metrics.signups_today },
                { label: "Last 7 days", value: metrics.signups_7d },
              ]}
            />
            <MetricGroup
              heading="ACTIVATION FUNNEL"
              rows={[
                { label: "Pending", value: metrics.athletes_pending },
                { label: "Active", value: metrics.athletes_active },
                { label: "Total", value: metrics.athletes_total },
              ]}
            />
            <MetricGroup
              heading="MATCHES"
              rows={[
                { label: "Today", value: metrics.matches_today },
                { label: "Last 7 days", value: metrics.matches_7d },
              ]}
            />
            <MetricGroup
              heading="SESSIONS"
              rows={[{ label: "Upcoming", value: metrics.sessions_upcoming }]}
            />
            <Button variant="outline" size="sm" onPress={reload}>
              Refresh
            </Button>
          </>
        ) : null}
      </PageContainer>
    </>
  );
}

function MetricGroup({
  heading,
  rows,
}: {
  heading: string;
  rows: { label: string; value: number | null | undefined }[];
}) {
  return (
    <View className="gap-2">
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l px-1">
        {heading}
      </Text>
      <Plate className="p-0 overflow-hidden">
        {rows.map((r, idx) => (
          <View key={r.label}>
            {idx > 0 ? <View className="h-px bg-hairline-faint" /> : null}
            <View className="flex-row items-center justify-between px-4 py-3">
              <Text className="font-body text-[13px] text-ink-2">{r.label}</Text>
              {/* Default a missing/null key to 0 so a malformed RPC payload
                  renders 0, not a blank value. */}
              <Text className="font-mono tabular-nums text-[16px] text-ink">
                {r.value ?? 0}
              </Text>
            </View>
          </View>
        ))}
      </Plate>
    </View>
  );
}
