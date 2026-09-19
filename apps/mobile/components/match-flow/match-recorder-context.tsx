import * as React from "react";
import { useVideoRecorder, type UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";

const MatchRecorderContext = React.createContext<UseVideoRecorderReturn | null>(null);

interface MatchRecorderProviderProps {
  matchId: string;
  /**
   * Current athlete's `athletes.id` (NOT auth_user_id), stamped on
   * `match_videos.uploaded_by` and required by the bucket's RLS path
   * convention. May be null only while auth is hydrating.
   */
  uploaderAthleteId: string | null;
  /** The match's configured `duration_seconds`; sizes the OS recording cap. */
  matchDurationSeconds: number | null;
  children: React.ReactNode;
}

/**
 * Owns the match recorder for the whole wizard (jits-od3).
 *
 * The recorder used to live inside the live step, which is why the upload
 * was invisible: ending a match stops the recorder and advances the step in
 * the same tick, the live step unmounts, and the upload only begins once
 * `recordAsync` settles, i.e. AFTER that unmount. Every subsequent signal,
 * success and failure alike, had nowhere left to render. The upload itself
 * already survives unmount deliberately (state setters are guarded by
 * `mountedRef` in the hook); what was missing was a surface that outlives
 * the step.
 *
 * Mounting the recorder here fixes that at the root: the provider sits above
 * the step boundary, so one recorder instance spans live, end, result,
 * confirm and summary. It also gives the camera somewhere to live that is
 * not destroyed and rebuilt at every step change, which is what lets the
 * capture session be warm before the match starts (jits-2zpe).
 *
 * It holds no session assumption of any kind, so an Arena match with no
 * session mounts it unchanged.
 */
export function MatchRecorderProvider({
  matchId,
  uploaderAthleteId,
  matchDurationSeconds,
  children,
}: MatchRecorderProviderProps) {
  const recorder = useVideoRecorder(matchId, uploaderAthleteId, matchDurationSeconds);
  return (
    <MatchRecorderContext.Provider value={recorder}>{children}</MatchRecorderContext.Provider>
  );
}

/**
 * The wizard's single recorder. Throws outside the provider rather than
 * returning a null-object: a step that silently got no recorder would
 * reproduce the exact invisible-upload failure this context exists to end.
 */
export function useMatchRecorder(): UseVideoRecorderReturn {
  const recorder = React.useContext(MatchRecorderContext);
  if (!recorder) {
    throw new Error("useMatchRecorder must be used inside a MatchRecorderProvider");
  }
  return recorder;
}
