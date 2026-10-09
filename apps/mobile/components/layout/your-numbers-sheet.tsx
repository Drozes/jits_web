/**
 * Your numbers (jits-1ez5.2): tapping the header rating opens this sheet, not
 * a push, so a live chip or a countdown is never left behind. The rating
 * large with the last match's delta, the rating line over the last 20
 * matches (peak as a dashed hairline when it is near the line), global rank
 * with the derived top %, the record, peak and this month. No streak. "View
 * full stats" pushes Profile's stats.
 *
 * Data: the dashboard summary through the cache entry Home shares
 * (`useDashboardSummary`) and the rating history, which draws the sparkline
 * and sums "this month" (`sumEloThisMonth`, the same sum Profile shows). The
 * sheet is mounted only while open, so both are read on open.
 *
 * Accessibility text sizes: the content scrolls inside a sheet that never
 * grows past the top safe area, and the fixed-shape values cap at 1.3x.
 */
import * as React from "react";
import { Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import Svg, { Line, Polyline, Rect } from "react-native-svg";
import { getEloHistory, type AthleteGuardRow } from "@jits/shared/api/queries";
import type { EloHistoryRow } from "@jits/shared/types/composites";
import { Button, DeltaChip, Label, Mono, spokenDelta } from "@/components/ui/elo-system";
import { SheetBackdrop, useSheetChrome } from "@/components/ui/sheet";
import { SkeletonBlock, SkeletonProvider } from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import { useDashboardSummary } from "@/lib/dashboard/use-dashboard-summary";
import {
  SPARK_MATCHES,
  deltaTone,
  eloThisMonthFromHistory,
  lastMatchDelta,
  monthStartLabel,
  peakLegend,
  peakNote,
  rankCell,
  recordCell,
  sparkPoints,
  sparkRange,
  type MatchOutcome,
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
/**
 * Dynamic Type cap for the fixed-shape parts (the hero, the cell values,
 * labels and notes): they grow to the chip's 1.3x and no further, so a cell
 * never breaks a number apart. The body copy scales fully.
 */
const SHEET_MAX_FONT_SCALE = 1.3;

function deltaColor(delta: number, p: Palette, outcome?: MatchOutcome | null): string {
  const tone = deltaTone(delta, outcome);
  return tone === "win" ? p.win : tone === "draw" ? p.amber : tone === "loss" ? p.loss : p.text;
}

const renderBackdrop = (props: BottomSheetBackdropProps) => <SheetBackdrop {...props} />;

interface YourNumbersSheetProps {
  athlete: AthleteGuardRow;
  open: boolean;
  /** The sheet closed (swipe, backdrop, a link or its tab losing focus); the parent unmounts it. */
  onClosed: () => void;
}

export function YourNumbersSheet({ athlete, open, onClosed }: YourNumbersSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const chrome = useSheetChrome();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

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
      // At accessibility text sizes the content is taller than the screen:
      // the sheet stops below the top safe area and its content scrolls.
      maxDynamicContentSize={height - insets.top}
      topInset={insets.top}
      enablePanDownToClose
      onChange={onChange}
      accessible={false}
      backdropComponent={renderBackdrop}
      {...chrome}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}>
        <View testID={YOUR_NUMBERS_SHEET_TEST_ID} className="gap-5 px-4 pt-2">
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
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** Everything under the title: hero, sparkline and the four cells. */
export function YourNumbersBody({ athlete }: { athlete: AthleteGuardRow }) {
  const p = usePalette();
  const dashboard = useDashboardSummary(athlete.id, { quiet: true });
  // `get_elo_history` takes no row limit; the sparkline draws the newest 20.
  const history = useCachedResource<EloHistoryRow[]>(
    `elo-history:${athlete.id}`,
    async () => getEloHistory(supabase, athlete.id),
    [athlete.id],
  );

  const current = athlete.current_elo;
  const summary = dashboard.data?.summary ?? null;
  const last = lastMatchDelta(summary);
  const totalMatches = summary?.stats?.total_matches ?? 0;
  const unranked = summary !== null && totalMatches === 0;
  // `getEloHistory` answers a failed read with no rows: an athlete with
  // matches and no history is a failed read, never "no change this month".
  const historyFailed =
    history.error !== null || (history.data !== undefined && history.data.length === 0 && totalMatches > 0);
  const historyRows = !historyFailed && history.data ? history.data : null;
  const thisMonth: MonthValue = history.isLoading && !history.data
    ? { kind: "loading" }
    : historyFailed || !historyRows
      ? { kind: "unavailable" }
      : { kind: "value", delta: eloThisMonthFromHistory(historyRows) };

  return (
    <View className="gap-5">
      <View
        testID="your-numbers-hero"
        accessible
        accessibilityLabel={
          last !== null && last.delta !== 0
            ? `Rating ${current}, ${spokenDelta(last.delta)} last match`
            : `Rating ${current}`
        }
        // Wraps instead of clipping at large text sizes.
        className="flex-row flex-wrap items-baseline"
        style={{ columnGap: 12 }}
      >
        <Mono size="display-44" weight="bold" tracking="numeral" maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}>
          {current}
        </Mono>
        {last !== null && last.delta !== 0 ? (
          <View className="flex-row items-baseline" style={{ columnGap: 12 }}>
            <DeltaChip
              testID="your-numbers-last-delta"
              delta={last.delta}
              color={deltaColor(last.delta, p, last.outcome)}
              shown
              animate={false}
              style={typeStep("subhead")}
              maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}
            />
            <Label maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}>Last match</Label>
          </View>
        ) : null}
      </View>

      {unranked ? (
        <Text testID="your-numbers-first-match" className="font-body text-body text-ink-2">
          Your first match sets your rank.
        </Text>
      ) : historyRows && historyRows.length > 0 ? (
        <Sparkline
          points={sparkPoints(historyRows, current)}
          matches={Math.min(historyRows.length, SPARK_MATCHES)}
          peak={Math.max(athlete.highest_elo, current)}
        />
      ) : history.isLoading && !history.data ? (
        <SkeletonProvider>
          <SkeletonBlock height={SPARK_HEIGHT} radius="xs" />
        </SkeletonProvider>
      ) : historyFailed ? (
        <Text testID="your-numbers-history-unavailable" className="font-body text-body text-ink-2">
          Your rating history is unavailable right now.
        </Text>
      ) : null}

      {dashboard.isLoading && !summary ? (
        <CellsSkeleton />
      ) : !summary ? (
        <View testID="your-numbers-error" className="gap-3">
          <Text className="font-body text-body text-ink-2">Could not load your numbers.</Text>
          <Button variant="ghost" label="Try again" height={44} onPress={dashboard.refresh} className="self-start" />
        </View>
      ) : (
        <Cells athlete={athlete} summary={summary} thisMonth={thisMonth} />
      )}
    </View>
  );
}

type MonthValue = { kind: "loading" } | { kind: "unavailable" } | { kind: "value"; delta: number };

function monthA11y(m: MonthValue): string {
  if (m.kind === "loading") return "This month: loading";
  if (m.kind === "unavailable") return "This month: unavailable";
  return `This month: ${spokenDelta(m.delta)}`;
}

function Cells({
  athlete,
  summary,
  thisMonth,
}: {
  athlete: AthleteGuardRow;
  summary: NonNullable<ReturnType<typeof useDashboardSummary>["data"]>["summary"];
  thisMonth: MonthValue;
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
            <Value>
              {rank.value} <Text className="font-mono text-small text-ink-2 tabular-nums">{rank.of}</Text>
            </Value>
            {rank.top ? <Note>{rank.top}</Note> : null}
          </>
        ) : (
          <Value>Unranked</Value>
        )}
      </Cell>
      <Cell testID="your-numbers-record" label="Record" a11y={`${record.label}, ${record.matches}`}>
        {/* One line, shrinking to fit: never one token per line. */}
        <Value fit>{record.value}</Value>
        <Note>{record.matches}</Note>
      </Cell>
      <Cell testID="your-numbers-peak" label="Peak" a11y={`Peak ${peak}, ${peakNote(peak, athlete.current_elo)}`}>
        <Value>{peak}</Value>
        <Note>{peakNote(peak, athlete.current_elo)}</Note>
      </Cell>
      <Cell testID="your-numbers-month" label="This month" a11y={monthA11y(thisMonth)}>
        {thisMonth.kind === "loading" ? (
          <SkeletonProvider>
            <SkeletonBlock width={56} height={18} radius="xs" />
          </SkeletonProvider>
        ) : thisMonth.kind === "unavailable" ? (
          <Text testID="your-numbers-month-unavailable" className="font-body text-body text-ink-2" maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}>
            Unavailable
          </Text>
        ) : thisMonth.delta === 0 ? (
          <Value>0</Value>
        ) : (
          <DeltaChip
            delta={thisMonth.delta}
            color={deltaColor(thisMonth.delta, p)}
            shown
            animate={false}
            style={typeStep("subhead")}
            maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}
          />
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
      <Label maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}>{label}</Label>
      {children}
    </View>
  );
}

function Value({ children, fit = false }: { children: React.ReactNode; fit?: boolean }) {
  return (
    <Text
      maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.6 : undefined}
      className="font-mono-bold text-subhead text-ink tabular-nums"
    >
      {children}
    </Text>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text
      maxFontSizeMultiplier={SHEET_MAX_FONT_SCALE}
      className="font-mono text-micro text-ink-3 uppercase tracking-caps tabular-nums"
    >
      {children}
    </Text>
  );
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

/**
 * The rating over the last matches ending at now (a square), with the peak
 * as a dashed hairline when it is near the line (`sparkRange`).
 */
function Sparkline({ points, matches, peak }: { points: number[]; matches: number; peak: number }) {
  const tokens = useThemedTokens();
  const [width, setWidth] = React.useState(0);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setWidth(w);
  }, []);
  if (points.length < 2) return null;

  const { lo, hi, showPeak } = sparkRange(points, peak);
  const span = hi - lo || 1;
  const inner = SPARK_HEIGHT - SPARK_PAD * 2;
  const y = (v: number) => SPARK_PAD + (1 - (v - lo) / span) * inner;
  const right = Math.max(1, width - SPARK_END_MARK / 2 - 1);
  const x = (i: number) => 1 + (i / (points.length - 1)) * (right - 1);
  const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const end = points[points.length - 1];
  const label = `Rating over your last ${matches} ${matches === 1 ? "match" : "matches"}, from ${points[0]} to ${end}. Peak ${peak}`;

  return (
    <View testID="your-numbers-sparkline" className="gap-1">
      {/* The Svg's own label never reaches VoiceOver: the wrapper carries it. */}
      <View
        testID="your-numbers-sparkline-chart"
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={onLayout}
        style={{ height: SPARK_HEIGHT }}
      >
        {width > 0 ? (
          <Svg width={width} height={SPARK_HEIGHT}>
            {showPeak ? (
              <Line
                x1={0}
                x2={width}
                y1={y(peak)}
                y2={y(peak)}
                stroke={tokens.borderHairlineStrong}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}
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
      {/* Wraps at large text sizes instead of running the notes together. */}
      <View
        className="flex-row flex-wrap justify-between"
        style={{ columnGap: 12 }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Note>{`${matches} ${matches === 1 ? "match" : "matches"} ago`}</Note>
        <Note>{peakLegend(peak, showPeak)}</Note>
        <Note>Now</Note>
      </View>
    </View>
  );
}
