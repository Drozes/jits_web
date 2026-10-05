import * as React from "react";
import { Text, View } from "react-native";
import { toneColor } from "@/components/video-status/film-status-bits";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import type { FilmStatusView } from "@/lib/video/film-status";

/**
 * The top of the Film status plate (deck section 4): the title, the phase
 * tag top right (the countdown while waiting, spoken in words), then the
 * phase line and its helper.
 */
export function FilmStatusHeader({ view, title, testID }: { view: FilmStatusView; title: string; testID: string }) {
  const p = usePalette();
  const tagColor = toneColor(view.phaseTone, p);
  const tagBorder = view.phaseTone === "waiting" ? p.amberRule : view.phaseTone === "negative" ? tagColor : p.strong;
  return (
    <>
      <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
        <Text accessibilityRole="header" className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text }, TABULAR]}>
          {title.toUpperCase()}
        </Text>
        <View
          testID={`${testID}-phase-tag`}
          accessible
          accessibilityLabel={view.countdown ? view.countdown.a11y : view.phaseTag}
          style={{ height: 20, paddingHorizontal: 7, borderRadius: 2, borderWidth: 1, borderColor: tagBorder, justifyContent: "center" }}
        >
          <Text className="font-mono-bold" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: tagColor }, TABULAR]}>
            {view.phaseTag.toUpperCase()}
          </Text>
        </View>
      </View>
      <View accessible style={{ gap: 4 }}>
        <Text testID={`${testID}-line`} className="font-body-medium" style={[typeStep("callout"), { color: p.text }]}>
          {view.line}
        </Text>
        {view.helper ? (
          <Text testID={`${testID}-helper`} className="font-body" style={[typeStep("small"), { color: p.text2 }]}>
            {view.helper}
          </Text>
        ) : null}
      </View>
    </>
  );
}
