import * as React from "react";
import { View } from "react-native";
import { AiConsentSheet } from "@/components/moderation/ai-consent-sheet";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { consentedIn, giveAiConsent, useAiConsent } from "@/lib/moderation/ai-consent";
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";
import { AttentionLine } from "../crew/attention-line";
import { FightButton } from "../fight/fight-ui";

/**
 * A seated timekeeper without consent to the timekeeper text (accepted on
 * another device or an older build, or the text changed since; jits-o47s.46)
 * would otherwise wait at TK-K10 for a camera that never arms. Once this
 * timekeeper's consent is known to be missing, the face-off opens the same
 * timekeeper "Before you film" sheet the request sheet shows. Allow records
 * it and the camera gate opens; Not now leaves TK-T8 and an "Allow and film"
 * button that opens the sheet again (secondary: Start stays the one primary).
 */
export function TimekeeperConsentGate({ timekeeperId }: { timekeeperId: string | null }) {
  const consent = useAiConsent();
  const known = timekeeperId != null && consent.athleteId === timekeeperId && consent.known;
  const missing = known && !consentedIn(consent, timekeeperId, "timekeeper");
  const [visible, setVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refused, setRefused] = React.useState(false);
  const askedRef = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  // Asked once by itself, when the answer is first known to be missing.
  React.useEffect(() => {
    if (missing && !askedRef.current) {
      askedRef.current = true;
      setVisible(true);
    }
  }, [missing]);

  const open = () => {
    setError(null);
    setVisible(true);
  };
  const onAllow = async () => {
    setBusy(true);
    setError(null);
    const ok = await giveAiConsent("timekeeper").catch(() => false);
    if (!alive.current) return;
    setBusy(false);
    if (!ok) return setError(AI_CONSENT_COPY.failed);
    setVisible(false);
    setRefused(false);
  };

  if (!missing) return null;
  return (
    <View style={{ gap: 12 }}>
      {refused ? <AttentionLine testID="faceoff-consent-refused" text={TIMEKEEPER_COPY["TK-T8"]} /> : null}
      <FightButton testID="faceoff-consent-open" variant="secondary" height={44} label={AI_CONSENT_COPY.allow} onPress={open} />
      <AiConsentSheet
        visible={visible}
        busy={busy}
        error={error}
        body={AI_CONSENT_COPY.timekeeperBody}
        onAllow={() => void onAllow()}
        onNotNow={() => {
          setVisible(false);
          setRefused(true);
        }}
        onDismiss={() => setVisible(false)}
      />
    </View>
  );
}
