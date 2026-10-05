/**
 * A `@/lib/video/use-film-status` module whose status read failed by
 * default: the screens fall back to the wave 2 film rows. For suites that
 * test those rows, or that do not care about the Film status plate:
 *
 *   jest.mock("@/lib/video/use-film-status", () => require("../support/film-status-mock").unavailableFilmStatusModule());
 *
 * A suite that wants the plate sets a result with `setMockFilmStatus` (and
 * resets it with `setMockFilmStatus(null)`).
 */
const UNAVAILABLE = {
  view: null,
  status: null,
  error: { code: "UNKNOWN", message: "unavailable" },
  loading: false,
  localUpload: null,
  refetch: () => undefined,
};

let current: Record<string, unknown> | null = null;

export function setMockFilmStatus(next: Record<string, unknown> | null): void {
  current = next;
}

export function unavailableFilmStatusModule() {
  return {
    useFilmStatus: () => (current ? { ...UNAVAILABLE, error: null, ...current } : UNAVAILABLE),
    useFilmStatusAnnouncements: () => undefined,
    subscribeAppForeground: () => () => undefined,
  };
}
