import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Video } from "lucide-react-native";
import { AiConsentSheet } from "@/components/moderation/ai-consent-sheet";
import { Button } from "@/components/ui/elo-system/button";
import { usePalette } from "@/lib/theme/palette";
import { typeStep } from "@/lib/typography";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { useTimekeepSheetScreen } from "@/lib/match-flow/timekeep-sheet-store";
import { Mono } from "../fight/fight-ui";
import { AttentionLine } from "./attention-line";
import { TimekeepMatchup } from "./timekeep-matchup";
import { useTimekeepSheet } from "./use-timekeep-sheet";

export interface TimekeepSheetProps {
  matchId: string;
  requestId: string | null;
  athleteId: string | null;
}

/**
 * `Timekeep this match?` (spec 4.2 Pick and Seat, board P-TK-B4, TK-T1 to
 * TK-T8): the asked person's answer, from the TK-N1 push or the in-app
 * realtime row. The incoming challenge prompt's look: the title with
 * `ANSWER IN {m:ss}`, the two athletes, what the timekeeper does, the
 * recording line, then Decline (outline) and Accept (the one Signal Red CTA).
 * While it is open the Arena holds any incoming challenge prompt (spec 9.1).
 */
export function TimekeepSheet({ matchId, requestId, athleteId }: TimekeepSheetProps) {
  const p = usePalette();
  const s = useTimekeepSheet({ matchId, requestId, athleteId });
  useTimekeepSheetScreen(matchId, s.request?.requestId ?? requestId);
  const req = s.request;
  return (
    <View testID="timekeep-sheet" className="flex-1 bg-surface">
      {req ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }} bounces={false}>
          <View accessibilityViewIsModal className="gap-6 rounded-lg border border-hairline-strong bg-surface-3 px-4 py-6">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text accessibilityRole="header" className="font-heading" style={[typeStep("title-l"), { flexShrink: 1, color: p.text }]}>
                {C["TK-T1"]}
              </Text>
              {s.secondsLeft != null ? (
                <Mono testID="timekeep-answer-in" bold size="body" spacing="normal" color={p.text} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {C["TK-T5"](s.secondsLeft)}
                </Mono>
              ) : null}
            </View>
            <TimekeepMatchup athletes={req.athletes} />
            <Text className="font-body" style={[typeStep("callout"), { color: p.text2 }]}>
              {C["TK-T2"]}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Video size={16} color={p.text2} />
              <Text className="font-body" style={[typeStep("body"), { flex: 1, color: p.text2 }]}>
                {C["TK-T7"]}
              </Text>
            </View>
            {s.consentRefused ? <AttentionLine testID="timekeep-consent-refused" text={C["TK-T8"]} /> : null}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {/* Decline 1 part, Accept 2 parts (the prompt's thumb zone). */}
              <Button testID="timekeep-decline" variant="secondary" style={{ flex: 1 }} label={C["TK-T4"]} busy={s.answering === "decline"} disabled={s.answering === "accept"} onPress={s.decline} />
              <Button testID="timekeep-accept" style={{ flex: 2 }} label={C["TK-T3"]} busy={s.answering === "accept"} disabled={s.answering === "decline"} onPress={s.accept} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator testID="timekeep-loading" color={p.text3} />
        </View>
      )}
      <AiConsentSheet {...s.consent} />
    </View>
  );
}
