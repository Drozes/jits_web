import { useArenaState } from "@/lib/arena/arena-store";
import { useOtaUpdate } from "@/lib/updates/use-ota-update";
import { CriticalUpdateModal } from "./critical-update-modal";
import { UpdateBanner } from "./update-banner";

/**
 * App-wide OTA update UI (jits-5i2w). Mounted ONCE in the root
 * `app/_layout.tsx`, outside AuthProvider, so signed-out users also get
 * critical updates. `suppressed` keeps it hidden behind the launch splash.
 *
 * The banner renders above the bottom-sheet portal, so it steps aside while
 * the Arena challenge prompt sheet is up (its Accept/Decline sit where the
 * banner would). The prompt shows exactly when the arena store has an
 * `incoming` challenge. The critical modal is never hidden for it.
 */
export function OtaUpdateBootstrap({ suppressed }: { suppressed: boolean }) {
  const { prompt, notice, restarting, restartError, restart, dismiss } = useOtaUpdate({
    suppressed,
  });
  const challengePromptUp = useArenaState().incoming !== null;

  if (prompt === "modal") {
    return (
      <CriticalUpdateModal
        visible
        notice={notice}
        onRestart={restart}
        restarting={restarting}
        error={restartError}
      />
    );
  }
  if (prompt === "banner" && !challengePromptUp) {
    return <UpdateBanner onRestart={restart} onDismiss={dismiss} restarting={restarting} />;
  }
  return null;
}
