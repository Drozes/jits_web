import * as React from "react";
import { toast } from "@/components/ui/toast";
import { setRecordingOptIn } from "@/lib/match-flow/recording-optin";
import { giveAiConsent, hasAiConsent } from "./ai-consent";
import { AI_CONSENT_COPY } from "./moderation-copy";

export interface AiConsentGate {
  /** The face-off "Record from my phone" switch's handler. */
  onRecordingChange: (next: boolean) => void;
  sheet: {
    visible: boolean;
    busy: boolean;
    error: string | null;
    onAllow: () => void;
    onNotNow: () => void;
    onDismiss: () => void;
  };
}

/**
 * The consent gate in front of "Record from my phone" (5.1.2(i)). Turning it
 * on without consent opens "Before you film" instead: Allow records consent
 * and only then turns recording on; Not now leaves it off and says the match
 * still counts. Turning it off, or on with consent, passes straight through.
 */
export function useAiConsentGate(): AiConsentGate {
  const [visible, setVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const aliveRef = React.useRef(true);
  React.useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const onRecordingChange = React.useCallback((next: boolean) => {
    if (next && !hasAiConsent()) {
      setError(null);
      setVisible(true);
      return;
    }
    setRecordingOptIn(next);
  }, []);

  const onAllow = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    const ok = await giveAiConsent();
    if (!aliveRef.current) return;
    setBusy(false);
    if (!ok) {
      setError(AI_CONSENT_COPY.failed);
      return;
    }
    setVisible(false);
    setRecordingOptIn(true);
  }, []);

  const onNotNow = React.useCallback(() => {
    setVisible(false);
    setRecordingOptIn(false);
    toast.info(AI_CONSENT_COPY.declinedNote);
  }, []);

  const onDismiss = React.useCallback(() => setVisible(false), []);

  return {
    onRecordingChange,
    sheet: { visible, busy, error, onAllow: () => void onAllow(), onNotNow, onDismiss },
  };
}
