/**
 * Caches that sign-out must forget alongside `resetHighlightStore`
 * (`highlight-store.ts`): the swipe viewer's signed URLs and lane sessions.
 * Dependency-free so pure modules (the lane session store) can register
 * without pulling the Supabase client in.
 */
const resetListeners = new Set<() => void>();

/** Registers a cache to clear on `resetHighlightStore`. Returns an unregister function. */
export function onHighlightStoreReset(cb: () => void): () => void {
  resetListeners.add(cb);
  return () => {
    resetListeners.delete(cb);
  };
}

export function runHighlightStoreResets(): void {
  for (const cb of resetListeners) cb();
}
