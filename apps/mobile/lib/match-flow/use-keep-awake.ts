import * as React from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

/** Wake-lock tag for the recorder steps (ready + live). */
export const MATCH_LIVE_KEEP_AWAKE_TAG = "match-live";
/**
 * Wake-lock tag for an in-flight match-video upload. Separate from the live
 * tag on purpose: the upload starts as the live step ends, so sharing one
 * tag would let the live step's release drop the upload's lock (and the
 * other way round) on the live -> end handoff.
 */
export const MATCH_UPLOAD_KEEP_AWAKE_TAG = "match-upload";

/**
 * Conditionally activates the screen wake-lock.
 *
 * We use the imperative `activateKeepAwakeAsync` / `deactivateKeepAwake`
 * pair instead of the `useKeepAwake()` hook because the lock should only
 * apply while `active === true`. React's rules of hooks forbid calling
 * `useKeepAwake()` conditionally, so we wrap the imperative API in an
 * effect keyed on `active`. The lock is released when `active` goes false
 * and on unmount.
 *
 * The tag namespaces the lock so other features can activate their own
 * keep-awake sessions without interfering. Each tag must have ONE holder.
 */
export function useMatchKeepAwake(active: boolean, tag: string = MATCH_LIVE_KEEP_AWAKE_TAG) {
  React.useEffect(() => {
    if (!active) return;
    void activateKeepAwakeAsync(tag).catch(() => {
      // Wake-lock failures are non-fatal -- match continues.
    });
    return () => {
      // Async in this expo-keep-awake version: a try/catch would not see a
      // rejection. Same shape as arena-bootstrap.
      void deactivateKeepAwake(tag).catch(() => {});
    };
  }, [active, tag]);
}
