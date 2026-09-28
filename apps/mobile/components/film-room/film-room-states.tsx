import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SkeletonBlock, SkeletonProvider } from "@/components/ui/skeleton";
import { usePalette } from "@/lib/theme/palette";
import { matchCountLabel } from "@/lib/film-room/format";

/** "SEPTEMBER 2026 ──────── 6 MATCHES"; count null when the month may be incomplete. */
export function MonthHeader({ label, count }: { label: string; count: number | null }) {
  const p = usePalette();
  return (
    <View className="flex-row items-center" style={{ gap: 10, marginTop: 22, marginBottom: 12 }}>
      <Text accessibilityRole="header" className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 2.52, color: p.text2 }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: p.hairline }} />
      {count != null ? (
        <Text className="font-mono-medium" style={{ fontSize: 10, letterSpacing: 1.68, color: p.text3 }}>
          {matchCountLabel(count)}
        </Text>
      ) : null}
    </View>
  );
}

/** A month rule and three rows of 3:4 poster blocks, static (minimal motion). */
export function FilmRoomSkeleton() {
  return (
    <View testID="film-room-loading" accessibilityLabel="Loading your matches" style={{ marginTop: 22 }}>
      <SkeletonProvider pulse={false}>
        <SkeletonBlock height={10} width="40%" radius="xs" />
        {[0, 1, 2].map((r) => (
          <View key={r} className="flex-row" style={{ gap: 16, marginTop: 16 }}>
            <SkeletonBlock className="flex-1" style={{ aspectRatio: 3 / 4 }} radius="xs" />
            <SkeletonBlock className="flex-1" style={{ aspectRatio: 3 / 4 }} radius="xs" />
          </View>
        ))}
      </SkeletonProvider>
    </View>
  );
}

function Panel({ testID, title, body, action }: { testID: string; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  const p = usePalette();
  return (
    <View testID={testID} className="items-center" style={{ marginTop: 48, paddingHorizontal: 24, gap: 8 }}>
      <Text className="font-mono-bold text-center" style={{ fontSize: 11, letterSpacing: 1.68, color: p.text }}>
        {title}
      </Text>
      <Text className="font-body text-center" style={{ fontSize: 13, lineHeight: 19, color: p.text2 }}>
        {body}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }} className="active:opacity-70" style={{ marginTop: 8 }}>
          <Text className="font-mono-bold uppercase" style={{ fontSize: 10, letterSpacing: 1.68, color: p.red }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilmRoomEmpty({
  filtered,
  onClear,
  onLoadOlder,
}: {
  filtered: boolean;
  onClear: () => void;
  /** Set when older pages exist that the filter has not searched yet. */
  onLoadOlder?: () => void;
}) {
  return filtered ? (
    onLoadOlder ? (
      <Panel testID="film-room-empty-filtered" title="NO MATCHES FOR THIS FILTER YET" body="Older matches have not loaded yet." action={{ label: "Search older matches", onPress: onLoadOlder }} />
    ) : (
      <Panel testID="film-room-empty-filtered" title="NO MATCHES FOR THIS FILTER" body="Try another result or opponent." action={{ label: "Show all", onPress: onClear }} />
    )
  ) : (
    <Panel testID="film-room-empty" title="NO FILM YET" body="Your matches land here after the final whistle. Turn on Record from my phone before your next match to get the film and a breakdown." />
  );
}

export function FilmRoomError({ onRetry }: { onRetry: () => void }) {
  return <Panel testID="film-room-error" title="COULDN'T LOAD YOUR MATCHES" body="Check your connection and try again." action={{ label: "Try again", onPress: onRetry }} />;
}

/** Below the grid: a spinner while paging, a retry after a failed page. */
export function ListFooter({ loadingMore, moreError, onRetry }: { loadingMore: boolean; moreError: boolean; onRetry: () => void }) {
  const p = usePalette();
  if (loadingMore) {
    return (
      <View testID="film-room-loading-more" style={{ paddingVertical: 24 }}>
        <ActivityIndicator color={p.text2} />
      </View>
    );
  }
  if (moreError) {
    return (
      <Pressable testID="film-room-more-retry" accessibilityRole="button" onPress={onRetry} className="items-center active:opacity-70" style={{ paddingVertical: 24 }}>
        <Text className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 1.68, color: p.text2 }}>
          COULDN'T LOAD MORE. TAP TO RETRY
        </Text>
      </Pressable>
    );
  }
  return <View style={{ height: 32 }} />;
}
