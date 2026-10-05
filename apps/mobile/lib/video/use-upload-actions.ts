import * as React from "react";
import { Alert } from "react-native";
import { toast } from "@/components/ui/toast";
import { discardMatchUpload, retryMatchUpload } from "./upload-control";

/**
 * Retry and Discard for one match's upload (jits-n2im.3 / .5), shared by
 * the verdict banner, match detail and the Film Room card.
 */
export function useUploadActions(matchId: string): { retry: () => void; discard: () => void } {
  const retry = React.useCallback(() => {
    void retryMatchUpload(matchId).then((started) => {
      if (!started) toast.error("This recording is no longer on this phone.");
    });
  }, [matchId]);

  const discard = React.useCallback(() => {
    Alert.alert(
      "Discard this recording?",
      "It can't be uploaded, and it will be deleted from this phone.",
      [
        { text: "Keep", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => void discardMatchUpload(matchId) },
      ],
    );
  }, [matchId]);

  return { retry, discard };
}
