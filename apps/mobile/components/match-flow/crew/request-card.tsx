import * as React from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/elo-system/button";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { FIGHT_RADIUS } from "../fight/fight-tokens";

export interface RequestCardProps {
  /** The open request as this athlete sees it. */
  request: { mine: boolean; requesterShort: string; inviteeShort: string };
  withdrawing: boolean;
  onWithdraw: () => void;
}

/**
 * The picker's open request (boards P-TK-B2 frames 3 and 4): one per match,
 * so while it is up every Ask is disabled. Mine reads TK-P17 `Asked {name}`;
 * the other athlete's TK-P20 `{athlete} asked {name}`, which follows their
 * phone live. Either athlete may withdraw it with `Ask someone else` (TK-P19,
 * R5). Pending, so the attention (amber) token: a dashed rule and a dot.
 */
export function RequestCard({ request, withdrawing, onWithdraw }: RequestCardProps) {
  const p = usePalette();
  const title = request.mine
    ? C["TK-P17"](request.inviteeShort)
    : C["TK-P20"]({ athlete: request.requesterShort, name: request.inviteeShort });
  return (
    <View
      testID="crew-request-card"
      accessibilityRole="summary"
      style={{
        gap: 12,
        padding: 14,
        backgroundColor: p.plate,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: p.amber,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.amber }} />
        <Text testID="crew-request-title" className="font-heading" style={[typeStep("subhead"), { flex: 1, color: p.text }]}>
          {title}
        </Text>
      </View>
      <Text className="font-body" style={[typeStep("body"), { color: p.text2 }]}>
        {C["TK-P18"]}
      </Text>
      <Button
        testID="crew-request-withdraw"
        variant="secondary"
        height={44}
        label={C["TK-P19"]}
        busy={withdrawing}
        onPress={onWithdraw}
      />
    </View>
  );
}
