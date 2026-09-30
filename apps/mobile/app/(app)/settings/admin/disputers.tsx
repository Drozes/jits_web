import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/elo-system";
import { RepeatDisputerRowCard } from "@/components/admin/repeat-disputer-row";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useRepeatDisputers } from "@/lib/admin/use-repeat-disputers";

/**
 * Admin > Repeat disputers (jits-02vo.11, backend jr_be-ahn.6). Athletes with
 * 3 or more disputes resolved against them in a rolling 30 days, with links
 * to their profile and each lost match. A signal only: nothing is sanctioned.
 * Self-guards like the hub, and also redirects when the server says not_admin.
 */
export default function AdminRepeatDisputersScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const tokens = useThemedTokens();
  const { rows, isLoading, error, notAdmin, reload } = useRepeatDisputers();

  if ((!authLoading && !isAdmin) || notAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="Repeat disputers" back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 12 }}>
        <Text className="font-body text-[12px] text-ink-3 px-1">
          Athletes with 3 or more disputes resolved against them in the last 30 days. A signal only: nothing is
          changed automatically.
        </Text>
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} />
          </View>
        ) : error ? (
          <Plate variant="loss" className="gap-3">
            <Text testID="disputers-error" className="font-body text-[13px] text-ink leading-relaxed">
              {error}
            </Text>
            <Button variant="outline" size="sm" onPress={reload}>
              Retry
            </Button>
          </Plate>
        ) : (
          <>
            {rows.length === 0 ? (
              <Plate>
                <Text testID="disputers-empty" className="font-body text-[13px] text-ink-2">
                  No repeat disputers in the last 30 days.
                </Text>
              </Plate>
            ) : (
              rows.map((row) => <RepeatDisputerRowCard key={row.athlete_id} row={row} />)
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
