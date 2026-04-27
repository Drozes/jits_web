import * as React from "react";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

const TAG = "match-live";

/**
 * Conditionally activates the screen wake-lock for the live match step.
 *
 * We use the imperative `activateKeepAwakeAsync` / `deactivateKeepAwake`
 * pair instead of the `useKeepAwake()` hook because the lock should only
 * apply while `active === true`. React's rules of hooks forbid calling
 * `useKeepAwake()` conditionally, so we wrap the imperative API in an
 * effect keyed on `active`.
 *
 * The tag (`match-live`) namespaces the lock so other features can
 * activate their own keep-awake sessions without interfering.
 */
export function useMatchKeepAwake(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void activateKeepAwakeAsync(TAG).catch(() => {
      // Wake-lock failures are non-fatal -- match continues.
    });
    return () => {
      cancelled = true;
      try {
        deactivateKeepAwake(TAG);
      } catch {
        /* noop */
      }
      // Silence the unused warning -- `cancelled` is here for future
      // async-await branches if we add them.
      void cancelled;
    };
  }, [active]);
}
