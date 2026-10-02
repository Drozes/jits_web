import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { usePalette } from "@/lib/theme/palette";
import type { BreakdownPhase } from "@/lib/match-detail/use-match-film";
import { isNoMatch } from "@jits/shared/utils";
import { NoMatchBreakdown } from "./no-match-breakdown";

function Heading({ tier }: { tier: string | null }) {
  const p = usePalette();
  return (
    <View className="flex-row items-center justify-between">
      <Text accessibilityRole="header" className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text }, TABULAR]}>
        AI BREAKDOWN
      </Text>
      {tier ? (
        <View style={{ height: 18, paddingHorizontal: 6, borderRadius: 2, borderWidth: 1, borderColor: p.strong, justifyContent: "center" }}>
          {/* The tier is a label, not a waiting state: ink steps only, never amber (WP2, R3 FR-2). */}
          <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: tier === "premium" ? p.text : p.text2 }, TABULAR]}>
            {tier.toUpperCase()}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Body({ children, tone = "text" }: { children: React.ReactNode; tone?: "text" | "muted" }) {
  const p = usePalette();
  return (
    <Text className="font-body" style={[typeStep("callout"), { lineHeight: 21, color: tone === "text" ? p.text : p.text2 }]}>
      {children}
    </Text>
  );
}

/**
 * The analysis summary for the selected angle, or why there is none yet:
 * uploading, analyzing (live chunk count), failed, or not analyzed. When the
 * analysis found no match in the video it says so instead of a summary.
 */
export function AiBreakdown({ phase, onRetry }: { phase: BreakdownPhase; onRetry: () => void }) {
  const p = usePalette();
  let tier: string | null = null;
  let body: React.ReactNode;
  if (phase.kind === "uploading") {
    body = <Body tone="muted">The breakdown starts once the film finishes uploading.</Body>;
  } else if (phase.kind === "analyzing") {
    body = (
      <View style={{ gap: 6 }}>
        <Text testID="breakdown-analyzing" className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.amber }, TABULAR]}>
          {phase.total ? `ANALYZING ${phase.done ?? 0}/${phase.total}` : "ANALYZING"}
        </Text>
        <Body tone="muted">The breakdown and key moments land here when the analysis finishes.</Body>
      </View>
    );
  } else if (phase.kind === "failed") {
    body = <Body tone="muted">The analysis failed for this recording. The film may still play.</Body>;
  } else if (phase.state === "ready" && phase.analysis && isNoMatch(phase.analysis)) {
    body = <NoMatchBreakdown reason={phase.analysis.no_match_reason} tips={phase.analysis.recommendations} />;
  } else if (phase.state === "ready" && phase.analysis) {
    tier = phase.analysis.analysis_tier;
    body = <Body>{phase.analysis.summary ?? "The breakdown has key moments but no summary."}</Body>;
  } else if (phase.state === "error") {
    body = (
      <View style={{ gap: 8 }}>
        <Body tone="muted">Couldn't load the breakdown.</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry breakdown" onPress={onRetry} className="self-start active:opacity-70" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.red }, TABULAR]}>
            TRY AGAIN
          </Text>
        </Pressable>
      </View>
    );
  } else if (phase.state === "loading") {
    body = <Body tone="muted">Loading the breakdown.</Body>;
  } else {
    body = <Body tone="muted">No breakdown for this recording yet.</Body>;
  }
  return (
    <View
      testID="ai-breakdown"
      accessibilityLabel="AI breakdown"
      style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: 3, padding: 14, gap: 10 }}
    >
      <Heading tier={tier} />
      {body}
    </View>
  );
}
