/**
 * Your numbers (jits-1ez5.2): tapping the header rating opens this sheet, not
 * a push, so a live chip or a countdown is never left behind. The rating
 * large with the last match's delta, the rating line over the last 20
 * matches (peak as a dashed hairline), global rank with the derived top %,
 * the record, peak and this month. No streak. "View full stats" pushes
 * Profile's stats.
 *
 * Data: the dashboard summary through the cache entry Home shares
 * (`useDashboardSummary`), "this month" from the profile query
 * (`useProfileData`, shared with Profile and Matches) and the rating history.
 * The sheet is mounted only while open, so all three are read on open.
 */
import * as React from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import { BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import Svg, { Line, Polyline, Rect } from "react-native-svg";
import { getEloHistory, type AthleteGuardRow } from "@jits/shared/api/queries";
import type { EloHistoryRow } from "@jits/shared/types/composites";
import { Button, DeltaChip, Label, Mono, spokenDelta } from "@/components/ui/elo-system";
import { SheetBackdrop, useSheetChrome } from "@/components/ui/sheet";
import { SkeletonBlock, SkeletonProvider } from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";
import { useProfileData } from "@/lib/profile/use-profile-data";
import {
  lastMatchDelta,
  monthStartLabel,
  peakNote,
  rankCell,
  recordCell,
  sparkPoints,
} from "@/lib/rating/your-numbers";
import { supabase } from "@/lib/supabase/client";
import { usePalette, type Palette } from "@/lib/theme/palette";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { typeStep } from "@/lib/typography";

export const YOUR_NUMBERS_SHEET_TEST_ID = "your-numbers-sheet";

const PROFILE_STATS_HREF = "/(app)/profile/stats";
const SPARK_HEIGHT = 64;
/** Room above and below the line so the end mark and stroke never clip. */
const SPARK_PAD = 4;
const SPARK_END_MARK = 6;

function deltaColor(delta: number, p: Palette): string {
  return delta > 0 ? p.win : delta < 0 ? p.loss : p.text;
}

const renderBackdrop = (props: BottomSheetBackdropProps) => <SheetBackdrop {...props} />;

interface YourNumbersSheetProps {
  athlete: AthleteGuardRow;
  open: boolean;
  /** The sheet closed (swipe, backdrop or a link); the parent unmounts it. */
  onClosed: () => void;
}

export function YourNumbersSheet({ athlete, open, onClosed }: YourNumbersSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const chrome = useSheetChrome();
  const router = useRouter();

  // Only dismiss() a sheet this component presented that has not closed
  // itself (notification-panel.tsx), or gorhom sticks in DISMISSING.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open) ref.current?.present();
    else if (wasOpen.current) ref.current?.dismiss();
    wasOpen.current = open;
  }, [open]);

  const onChange = React.useCallback(
    (index: number) => {
      if (index !== -1) return;
      wasOpen.current = false;
      onClosed();
    },
    [onClosed],
  );

  const openStats = () => {
    ref.current?.dismiss();
    router.push(PROFILE_STATS_HREF);
  };

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onChange={onChange}
      accessible={false}
      backdropComponent={renderBackdrop}
      {...chrome}
    >
      <BottomSheetView>
        <View testID={YOUR_NUMBERS_SHEET_TEST_ID} className="gap-5 px-4 pb-8 pt-2">
          <Text accessibilityRole="header" className="font-heading text-callout uppercase tracking-caps-l text-ink">
            Your numbers
          </Text>
          <YourNumbersBody athlete={athlete} />
          <Button
            testID="your-numbers-full-stats"
            variant="secondary"
            label="View full stats"
            height={44}
            onPress={openStats}
          />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

/** Everything under the title: hero, sparkline and the four cells. */
export function YourNumbersBody({ athlete }: { athlete: AthleteGuardRow }) {
  const p = usePalette();
  const dashboard = useDashboardSummary(athlete.id, { quiet: true });
  const profile = useProfileData(athlete.id, athlete.primary_gym_id, { quiet: true });
  const history = useCachedResource<EloHistoryRow[]>(
    `elo-history:${athlete.id}`,
    async () => getEloHistory(supabase, athlete.id),
    [athlete.id],
  );

  const current = athlete.current_elo;
  const summary = dashboard.data?.summary ?? null;
  const delta = lastMatchDelta(summary);
  const unranked = summary !== null && (summary.stats?.total_matches ?? 0) === 0;

  return (
    <View className="gap-5">
      <View
        testID="your-numbers-hero"
        accessible
        accessibilityLabel={
          delta !== null && delta !== 0 ? `Rating ${current}, ${spokenDelta(delta)} last match` : `Rating ${current}`
        }
        className="flex-row items-baseline gap-3"
      >
        <Mono size="display-44" weight="bold" tracking="numeral" maxFontSizeMultiplier={1.3}>
          {current}
        </Mono>
        {delta !== null && delta !== 0 ? (
          <>
            <DeltaChip
              testID="your-numbers-last-delta"
              delta={delta}
              color={deltaColor(delta, p)}
              shown
              animate={false}
              style={typeStep("subhead")}
            />
            <Label>Last match</Label>
          </>
        ) : null}
      </View>

      {unranked ? (
        <Text testID="your-numbers-first-match" className="font-body text-body text-ink-2">
          Your first match sets your rank.
        </Text>
      ) : history.data && history.data.length > 0 ? (
        <Sparkline points={sparkPoints(history.data, current)} peak={Math.max(athlete.highest_elo, current)} />
      ) : history.isLoading ? (
        <SkeletonProvider>
          <SkeletonBlock height={SPARK_HEIGHT} radius="xs" />
        </SkeletonProvider>
      ) : null}

      {dashboard.isLoading && !summary ? (
        <CellsSkeleton />
      ) : !summary ? (
        <View testID="your-numbers-error" className="gap-3">
          <Text className="font-body text-body text-ink-2">Could not load your numbers.</Text>
          <Button variant="ghost" label="Try again" height={44} onPress={dashboard.refresh} className="self-start" />
        </View>
      ) : (
        <Cells athlete={athlete} summary={summary} eloThisMonth={profile.isLoading ? null : profile.eloThisMonth} />
      )}
    </View>
  );
}

function Cells({
  athlete,
  summary,
  eloThisMonth,
}: {
  athlete: AthleteGuardRow;
  summary: NonNullable<ReturnType<typeof useDashboardSummary>["data"]>["summary"];
  eloThisMonth: number | null;
}) {
  const p = usePalette();
  const rank = rankCell(summary);
  const record = recordCell(summary.stats);
  const peak = Math.max(athlete.highest_elo, athlete.current_elo);

  return (
    <View className="flex-row flex-wrap" style={{ rowGap: 16 }}>
      <Cell testID="your-numbers-rank" label="Global rank" a11y={rank ? rank.label : "Global rank: Unranked"}>
        {rank ? (
          <>
            <Text className="font-mono-bold text-subhead text-ink tabular-nums">
              {rank.value} <Text className="font-mono text-small text-ink-2 tabular-nums">{rank.of}</Text>
            </Text>
            {rank.top ? <Note>{rank.top}</Note> : null}
          </>
        ) : (
          <Text className="font-mono-bold text-subhead text-ink tabular-nums">Unranked</Text>
        )}
      </Cell>
      <Cell testID="your-numbers-record" label="Record" a11y={`${record.label}, ${record.matches}`}>
        <Text className="font-mono-bold text-subhead text-ink tabular-nums">{record.value}</Text>
        <Note>{record.matches}</Note>
      </Cell>
      <Cell testID="your-numbers-peak" label="Peak" a11y={`Peak ${peak}, ${peakNote(peak, athlete.current_elo)}`}>
        <Text className="font-mono-bold text-subhead text-ink tabular-nums">{peak}</Text>
        <Note>{peakNote(peak, athlete.current_elo)}</Note>
      </Cell>
      <Cell
        testID="your-numbers-month"
        label="This month"
        a11y={eloThisMonth === null ? "This month: loading" : `This month: ${spokenDelta(eloThisMonth)}`}
      >
        {eloThisMonth === null ? (
          <SkeletonProvider>
            <SkeletonBlock width={56} height={18} radius="xs" />
          </SkeletonProvider>
        ) : eloThisMonth === 0 ? (
          <Text className="font-mono-bold text-subhead text-ink tabular-nums">0</Text>
        ) : (
          <DeltaChip delta={eloThisMonth} color={deltaColor(eloThisMonth, p)} shown animate={false} style={typeStep("subhead")} />
        )}
        <Note>{monthStartLabel()}</Note>
      </Cell>
    </View>
  );
}

/** One of the four cells: a mono caps label, the value, a note. Half the row. */
function Cell({
  testID,
  label,
  a11y,
  children,
}: {
  testID: string;
  label: string;
  a11y: string;
  children: React.ReactNode;
}) {
  return (
    <View testID={testID} accessible accessibilityLabel={a11y} className="w-1/2 gap-1 pr-3">
      <Label>{label}</Label>
      {children}
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <Text className="font-mono text-micro text-ink-3 uppercase tracking-caps tabular-nums">{children}</Text>;
}

function CellsSkeleton() {
  return (
    <SkeletonProvider>
      <View testID="your-numbers-loading" className="flex-row flex-wrap" style={{ rowGap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="w-1/2 gap-2 pr-3">
            <SkeletonBlock width="40%" height={10} radius="xs" />
            <SkeletonBlock width="70%" height={18} radius="xs" />
          </View>
        ))}
      </View>
    </SkeletonProvider>
  );
}

/** The rating over the last matches, the peak as a dashed hairline, a square at now. */
function Sparkline({ points, peak }: { points: number[]; peak: number }) {
  const tokens = useThemedTokens();
  const [width, setWidth] = React.useState(0);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setWidth(w);
  }, []);
  if (points.length < 2) return null;

  const lo = Math.min(...points);
  const hi = Math.max(peak, ...points);
  const span = hi - lo || 1;
  const inner = SPARK_HEIGHT - SPARK_PAD * 2;
  const y = (v: number) => SPARK_PAD + (1 - (v - lo) / span) * inner;
  const right = Math.max(1, width - SPARK_END_MARK / 2 - 1);
  const x = (i: number) => 1 + (i / (points.length - 1)) * (right - 1);
  const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const end = points[points.length - 1];
  const matches = points.length - 1;

  return (
    <View testID="your-numbers-sparkline" className="gap-1">
      <View onLayout={onLayout} style={{ height: SPARK_HEIGHT }}>
        {width > 0 ? (
          <Svg
            width={width}
            height={SPARK_HEIGHT}
            accessibilityRole="image"
            accessibilityLabel={`Rating over your last ${matches} matches, from ${points[0]} to ${end}. Peak ${peak}`}
          >
            <Line
              x1={0}
              x2={width}
              y1={y(peak)}
              y2={y(peak)}
              stroke={tokens.borderHairlineStrong}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Polyline
              points={coords}
              fill="none"
              stroke={tokens.textPrimary}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Rect
              x={x(points.length - 1) - SPARK_END_MARK / 2}
              y={y(end) - SPARK_END_MARK / 2}
              width={SPARK_END_MARK}
              height={SPARK_END_MARK}
              fill={tokens.textPrimary}
            />
          </Svg>
        ) : null}
      </View>
      <View className="flex-row justify-between" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Note>{`${matches} ${matches === 1 ? "match" : "matches"} ago`}</Note>
        <Note>Peak dashed</Note>
        <Note>Now</Note>
      </View>
    </View>
  );
}
