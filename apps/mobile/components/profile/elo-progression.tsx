import * as React from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { eloGridTicks, type EloProgression } from "@jits/shared/utils";
import { Plate } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { TYPE_SCALE } from "@/lib/typography";

const CHART_HEIGHT = 120;
const PLOT_TOP = 21;
const PLOT_BOTTOM = 94;
const LEFT_PAD = 4;
/** Room on the right for the gridline value labels. */
const RIGHT_PAD = 34;
const DEFAULT_WIDTH = 328;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

interface EloProgressionChartProps {
  progression: EloProgression;
}

/**
 * ELO Progression (P-Profile-Stats): a dotted line of the athlete's rating
 * across the selected window, the window's start and current rating
 * labelled, net change and match count in the header, start/end dates
 * underneath. An empty window is a flat line at the current rating.
 */
export function EloProgressionChart({ progression }: EloProgressionChartProps) {
  const tokens = useThemedTokens();
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setWidth(w);
  }, []);

  const { points, start, end, delta, matches, startDate, endDate } = progression;
  const ticks = eloGridTicks(points);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => PLOT_BOTTOM - ((v - lo) / (hi - lo)) * (PLOT_BOTTOM - PLOT_TOP);
  const plotRight = Math.max(LEFT_PAD + 1, width - RIGHT_PAD);
  const x = (i: number) =>
    points.length <= 1 ? LEFT_PAD : LEFT_PAD + (i / (points.length - 1)) * (plotRight - LEFT_PAD);
  const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const endX = x(points.length - 1);
  const endY = y(end);
  const startY = y(start);

  return (
    <Plate>
      <View className="flex-row items-baseline justify-between mb-3">
        <Text className="font-heading text-small text-ink uppercase tracking-caps">
          ELO Progression
        </Text>
        <View className="flex-row items-baseline gap-2">
          {matches > 0 && (
            <Text
              testID="elo-progression-delta"
              className={`font-mono-bold text-caption tabular-nums ${
                delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-ink-3"
              }`}
            >
              {signed(delta)}
            </Text>
          )}
          <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
            {matches === 1 ? "1 match" : `${matches} matches`}
          </Text>
        </View>
      </View>

      <View onLayout={onLayout}>
        <Svg
          width={width}
          height={CHART_HEIGHT}
          accessibilityRole="image"
          accessibilityLabel={`ELO rating over time, from ${start} to ${end}`}
        >
          {ticks.map((t) => (
            <React.Fragment key={t}>
              <Line
                x1={0}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                stroke={tokens.borderHairlineFaint}
                strokeWidth={1}
              />
              <SvgText
                x={width}
                y={y(t) - 3}
                textAnchor="end"
                fontSize={TYPE_SCALE.micro.fontSize}
                fontFamily="JetBrainsMono_400Regular"
                fill={tokens.textTertiary}
              >
                {String(t)}
              </SvgText>
            </React.Fragment>
          ))}
          <Polyline
            testID="elo-progression-line"
            points={coords}
            fill="none"
            stroke={tokens.textPrimary}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle
            cx={LEFT_PAD}
            cy={startY}
            r={2.5}
            fill={tokens.bgPrimary}
            stroke={tokens.textPrimary}
            strokeWidth={1.5}
          />
          <Circle cx={endX} cy={endY} r={3} fill={tokens.textPrimary} />
          <SvgText
            x={LEFT_PAD}
            y={Math.min(CHART_HEIGHT - 2, startY + 15)}
            fontSize={TYPE_SCALE.micro.fontSize}
            fontFamily="JetBrainsMono_700Bold"
            fill={tokens.textTertiary}
          >
            {String(start)}
          </SvgText>
          <SvgText
            x={endX}
            y={Math.max(10, endY - 8)}
            textAnchor="end"
            fontSize={TYPE_SCALE.caption.fontSize}
            fontFamily="JetBrainsMono_700Bold"
            fill={tokens.textPrimary}
          >
            {String(end)}
          </SvgText>
        </Svg>
      </View>

      {(startDate || endDate) && (
        <View className="flex-row justify-between mt-2">
          <Text className="font-mono text-micro text-ink-3 uppercase tracking-caps tabular-nums">
            {startDate ? shortDate(startDate) : ""}
          </Text>
          <Text className="font-mono text-micro text-ink-3 uppercase tracking-caps tabular-nums">
            {endDate ? shortDate(endDate) : ""}
          </Text>
        </View>
      )}
    </Plate>
  );
}
