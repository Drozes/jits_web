import * as React from "react";
import { Text, View } from "react-native";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { shortName } from "@/lib/match-flow/short-name";
import { SHIPPED_COPY } from "@/lib/match-flow/timekeeper-copy";
import { FIGHT_RADIUS } from "../fight/fight-tokens";

/**
 * The two athletes on the asked person's sheet, challenger first (board
 * P-TK-B4 frame 2): the fight chip's shape with no you-mark, since the
 * timekeeper is neither athlete. `get_timekeeper_request` carries names
 * only, so no ratings, and the VS (the face-off's, `SHIPPED_COPY.vs`) stays
 * neutral ink on a sheet whose one Signal Red is Accept.
 */
export function TimekeepMatchup({ athletes }: { athletes: { id: string; displayName: string }[] }) {
  const p = usePalette();
  const [a, b] = athletes;
  const name = (n: string | undefined, align: "flex-start" | "flex-end") => (
    <View style={{ flex: 1, minWidth: 0, alignItems: align, justifyContent: "center" }}>
      <Text
        numberOfLines={1}
        className="font-heading uppercase"
        style={[typeStep("subhead"), { letterSpacing: TRACKING.loose, color: p.text }]}
      >
        {n ? shortName(n) : ""}
      </Text>
    </View>
  );
  return (
    <View
      testID="timekeep-matchup"
      style={{
        height: 64,
        flexDirection: "row",
        paddingHorizontal: 12,
        backgroundColor: p.plate,
        borderWidth: 1,
        borderColor: p.strong,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      {name(a?.displayName, "flex-start")}
      <View style={{ width: 44, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-display" style={[typeStep("title-xl"), { color: p.text2 }]}>
          {SHIPPED_COPY.vs}
        </Text>
      </View>
      {name(b?.displayName, "flex-end")}
    </View>
  );
}
