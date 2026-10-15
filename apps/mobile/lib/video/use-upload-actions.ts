import * as React from "react";
import { Alert } from "react-native";
import { toast } from "@/components/ui/toast";
import { router } from "expo-router";
import { discardMatchUpload, retryMatchUpload, type RetryMatchUploadResult } from "./upload-control";
import { giveAiConsent } from "@/lib/moderation/ai-consent";
import { AI_CONSENT_COPY } from "@/lib/moderation/moderation-copy";
import { legalHref } from "@/lib/legal/legal-copy";

/** The deck's label for every retry control (convention 4). */
export const TRY_AGAIN_LABEL = "Try again";
/** The deck's accessibility label for it (section 10.4). */
export const TRY_AGAIN_A11Y = "Try again: upload match video";

/** Discard strings (appended to the copy deck as its "Discard" section). */
export const DISCARD_LABEL = "Discard recording";
export const DISCARD_TITLE = "Discard this recording?";
export const DISCARD_BODY = "It can't be uploaded, and it will be deleted from this phone.";

/**
 * What a Try again that could not start says, by reason (m8). "started"
 * and "running" say nothing: the card itself shows the run.
 */
export function retryRefusedCopy(result: RetryMatchUploadResult): string | null {
  switch (result) {
    case "no_job":
      return "The clip isn't on this phone anymore.";
    case "signed_out":
      return "Sign in again to finish this upload.";
    case "other_athlete":
      return "Only the athlete who recorded this can upload it. Sign in as them to finish.";
    default:
      return null;
  }
}

/**
 * Try again and Discard for one match's upload (jits-n2im.3 / .5), shared
 * by the verdict card, match detail and the Film Room card.
 */
export function useUploadActions(matchId: string): { retry: () => void; discard: () => void } {
  const discard = React.useCallback(() => {
    Alert.alert(DISCARD_TITLE, DISCARD_BODY, [
      { text: "Keep", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => void discardMatchUpload(matchId) },
    ]);
  }, [matchId]);

  const retry = React.useCallback(() => {
    const run = () =>
      void retryMatchUpload(matchId).then((result) => {
        if (result === "needs_consent") {
          askConsentToUpload(run, discard);
          return;
        }
        const refused = retryRefusedCopy(result);
        if (refused) toast.error(refused);
      });
    run();
  }, [matchId, discard]);

  return { retry, discard };
}

/**
 * A clip waiting for AI processing consent (jits-rog5.11): Try again asks
 * first. Allow records consent and uploads; Not now keeps the clip parked
 * on this phone; Delete clip drops it without consenting (through the
 * usual Discard confirm).
 */
export function askConsentToUpload(onAllowed: () => void, onDelete: () => void): void {
  Alert.alert(AI_CONSENT_COPY.uploadTitle, AI_CONSENT_COPY.body, [
    { text: AI_CONSENT_COPY.notNow, style: "cancel", onPress: () => toast.info(AI_CONSENT_COPY.uploadParked) },
    { text: AI_CONSENT_COPY.privacyLink, onPress: () => router.push(legalHref("privacy", undefined, "4")) },
    { text: AI_CONSENT_COPY.deleteClip, style: "destructive", onPress: onDelete },
    {
      text: AI_CONSENT_COPY.allowUpload,
      onPress: () =>
        void giveAiConsent().then((ok) => {
          if (ok) onAllowed();
          else toast.error(AI_CONSENT_COPY.failed);
        }),
    },
  ]);
}
