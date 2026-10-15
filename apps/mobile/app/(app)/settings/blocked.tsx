/**
 * Settings, Blocked athletes (App Review 1.2, jits-rog5.11): the athletes I
 * blocked, most recent first, each with Unblock. Read fresh on every visit
 * (`refreshBlocks`), drawn from the block store so a block made on a profile
 * shows here at once.
 */
import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { BlockedAthlete } from "@jits/shared/api/moderation";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Avatar32, Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { toast } from "@/components/ui/toast";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { refreshBlocks, unblockAndRefresh, useBlockState } from "@/lib/moderation/block-store";
import {
  MODERATION_COPY,
  UNBLOCK_FAILED,
  formatShortDate,
  moderationErrorCopy,
} from "@/lib/moderation/moderation-copy";

export default function BlockedAthletesScreen() {
  const tokens = useThemedTokens();
  const { blockedList, loaded } = useBlockState();
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(() => {
    void refreshBlocks().then((ok) => setFailed(!ok));
  }, []);
  useFocusEffect(load);

  return (
    <>
      <AppHeader title={MODERATION_COPY.blockedListTitle} back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 16 }}>
        {failed && !loaded ? (
          <View className="gap-4">
            <Text testID="blocked-error" accessibilityRole="alert" className="font-body text-callout text-ink-2">
              {MODERATION_COPY.blockedListError}
            </Text>
            <Button variant="secondary" label={MODERATION_COPY.tryAgain} onPress={load} />
          </View>
        ) : !loaded ? (
          <View className="items-center py-16">
            <ActivityIndicator color={tokens.textTertiary} accessibilityLabel="Loading blocked athletes" />
          </View>
        ) : blockedList.length === 0 ? (
          <Plate testID="blocked-empty" className="gap-2">
            <Text className="font-body text-callout text-ink">{MODERATION_COPY.blockedListEmpty}</Text>
            <Text className="font-body text-body text-ink-2">{MODERATION_COPY.blockedListEmptyHint}</Text>
          </Plate>
        ) : (
          <Plate className="p-0 overflow-hidden">
            {blockedList.map((b, i) => (
              <React.Fragment key={b.athlete_id}>
                {i > 0 ? <View className="h-px bg-hairline-faint" /> : null}
                <BlockedRow athlete={b} />
              </React.Fragment>
            ))}
          </Plate>
        )}
      </PageContainer>
    </>
  );
}

function BlockedRow({ athlete }: { athlete: BlockedAthlete }) {
  const [busy, setBusy] = React.useState(false);
  const name = athlete.display_name || "Athlete";
  const since = formatShortDate(athlete.blocked_at);
  const unblock = async () => {
    setBusy(true);
    const res = await unblockAndRefresh(athlete.athlete_id);
    setBusy(false);
    if (!res.ok) toast.error(moderationErrorCopy(res.error.hint, UNBLOCK_FAILED));
    else toast.success(MODERATION_COPY.unblocked(name));
  };
  return (
    <View testID={`blocked-row-${athlete.athlete_id}`} className="flex-row items-center gap-3 px-4 py-3">
      <Avatar32 name={name} photoUrl={null} />
      <View className="flex-1">
        <Text className="font-heading text-callout text-ink" numberOfLines={1}>
          {name}
        </Text>
        {since ? (
          <Text className="font-mono text-micro tabular-nums uppercase tracking-caps-l text-ink-3">{MODERATION_COPY.blockedSince(since)}</Text>
        ) : null}
      </View>
      <Button
        testID={`unblock-${athlete.athlete_id}`}
        variant="secondary"
        height={44}
        label={MODERATION_COPY.unblockAthlete}
        accessibilityLabel={`Unblock ${name}`}
        busy={busy}
        onPress={() => void unblock()}
      />
    </View>
  );
}
