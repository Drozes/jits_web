import * as React from "react";
import { AppState } from "react-native";
import { useAuth } from "@/lib/auth/hooks";
import { loadBlocks, refreshBlocks } from "./block-store";
import { loadAiConsent } from "./ai-consent";

/**
 * Mounted once in `app/(app)/_layout.tsx`: reads the block sets and the AI
 * processing consent for the signed-in athlete (and clears them when the
 * athlete changes or signs out). The block sets are re-read when the app
 * comes back to the foreground, since a block made against me elsewhere
 * reaches this phone no other way. Renders nothing.
 */
export function ModerationBootstrap() {
  const { athlete } = useAuth();
  const athleteId = athlete?.id ?? null;

  React.useEffect(() => {
    void loadBlocks(athleteId);
    void loadAiConsent(athleteId);
  }, [athleteId]);

  React.useEffect(() => {
    if (!athleteId) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refreshBlocks();
    });
    return () => sub.remove();
  }, [athleteId]);

  React.useEffect(
    () => () => {
      void loadBlocks(null);
      void loadAiConsent(null);
    },
    [],
  );

  return null;
}
