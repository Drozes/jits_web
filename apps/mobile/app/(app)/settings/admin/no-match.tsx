import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/elo-system";
import { NoMatchVideoRowCard } from "@/components/admin/no-match-video-row";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAdminNoMatchVideos } from "@/lib/admin/use-admin-no-match-videos";

/**
 * Admin > No-match videos (jr_be-0qf). Recent match videos whose analysis
 * found no jiu-jitsu, with the match they were attached to and the rating
 * changes it recorded: a read-only review aid for spotting fabricated
 * results. It changes nothing. Self-guards like the hub.
 */
export default function AdminNoMatchVideosScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const tokens = useThemedTokens();
  const { rows, isLoading, error, reload } = useAdminNoMatchVideos();

  if (!authLoading && !isAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="No-match videos" back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 12 }}>
        <Text className="font-body text-[12px] text-ink-3 px-1">
          Videos from the last 30 days where the analysis found no match. A signal only: nothing is changed
          automatically.
        </Text>
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} />
          </View>
        ) : error ? (
          <Plate variant="loss" className="gap-3">
            <Text className="font-body text-[13px] text-ink leading-relaxed">{error}</Text>
            <Button variant="outline" size="sm" onPress={reload}>
              Retry
            </Button>
          </Plate>
        ) : (
          <>
            {rows.length === 0 ? (
              <Plate>
                <Text testID="no-match-empty" className="font-body text-[13px] text-ink-2">
                  No no-match videos in this window.
                </Text>
              </Plate>
            ) : (
              rows.map((row) => <NoMatchVideoRowCard key={row.video_id} row={row} />)
            )}
            <Button variant="outline" size="sm" onPress={reload}>
              Refresh
            </Button>
          </>
        )}
      </PageContainer>
    </>
  );
}
