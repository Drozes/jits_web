import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import type { BreakdownPhase } from "@/lib/match-detail/use-match-film";

function Heading({ tier }: { tier: string | null }) {
  const p = usePalette();
  return (
    <View className="flex-row items-center justify-between">
      <Text accessibilityRole="header" className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 2.52, color: p.text }}>
        AI BREAKDOWN
      </Text>
      {tier ? (
        <View style={{ height: 18, paddingHorizontal: 6, borderRadius: 2, borderWidth: 1, borderColor: tier === "premium" ? p.amberRule : p.strong, justifyContent: "center" }}>
          <Text className="font-mono-bold" style={{ fontSize: 9, letterSpacing: 1.6, color: tier === "premium" ? p.amber : p.text2 }}>
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
    <Text className="font-body" style={{ fontSize: 14, lineHeight: 21, color: tone === "text" ? p.text : p.text2 }}>
      {children}
    </Text>
  );
}

/**
 * The analysis summary for the selected angle, or why there is none yet:
 * uploading, analyzing (live chunk count), failed, or not analyzed.
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
        <Text testID="breakdown-analyzing" className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 2.2, color: p.amber }}>
          {phase.total ? `ANALYZING ${phase.done ?? 0}/${phase.total}` : "ANALYZING"}
        </Text>
        <Body tone="muted">The breakdown and key moments land here when the analysis finishes.</Body>
      </View>
    );
  } else if (phase.kind === "failed") {
    body = <Body tone="muted">The analysis failed for this recording. The film may still play.</Body>;
  } else if (phase.state === "ready" && phase.analysis) {
    tier = phase.analysis.analysis_tier;
    body = <Body>{phase.analysis.summary ?? "The breakdown has key moments but no summary."}</Body>;
  } else if (phase.state === "error") {
    body = (
      <View style={{ gap: 8 }}>
        <Body tone="muted">Couldn't load the breakdown.</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry breakdown" onPress={onRetry} className="self-start active:opacity-70" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Text className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 1.68, color: p.red }}>
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
