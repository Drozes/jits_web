/**
 * useViewerStakes on Rating V9 (jr_be spec 019 section 7.1): one
 * get_rating_stakes read keyed by the opponent's id, the match id and both
 * displayed ratings; null while loading, when disabled, without an opponent,
 * on a null response, on an error, and on the render where the key changes.
 */
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
const mockGetRatingStakes = jest.fn();
const mockGetEloStakes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getRatingStakes: (...a: unknown[]) => mockGetRatingStakes(...a),
  getEloStakes: (...a: unknown[]) => mockGetEloStakes(...a),
}));

import { useViewerStakes, viewerStakesKey, weightsStakesKey } from "@/lib/match-flow/use-viewer-stakes";
import { ratingStakes } from "../../support/rating-stakes";

type Props = { enabled: boolean; opp: string | null; match: string | null; my: number | null; their: number | null; extra?: string | null };
const BASE: Props = { enabled: true, opp: "opp-1", match: "M1", my: 1512, their: 1498, extra: "170|167" };

function mount(initial: Props = BASE) {
  return renderHook((p: Props) => useViewerStakes(p.enabled, p.opp, p.match, p.my, p.their, p.extra), { initialProps: initial });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockGetRatingStakes.mockReset();
  mockGetEloStakes.mockReset();
});

describe("viewerStakesKey", () => {
  it("joins the opponent, the match and both ratings", () => {
    expect(viewerStakesKey("opp-1", "M1", 1512, 1498)).toBe("opp-1|M1|1512|1498|");
    expect(viewerStakesKey("opp-1", null, 1512, null)).toBe("opp-1||1512||");
    expect(viewerStakesKey("opp-1", "M1", 1512, 1498, weightsStakesKey(170, null))).toBe("opp-1|M1|1512|1498|170|");
    expect(viewerStakesKey("opp-1", "M1", 1512, 1498)).not.toBe(viewerStakesKey("opp-2", "M1", 1512, 1498));
    expect(viewerStakesKey("opp-1", "M1", 1512, 1498)).not.toBe(viewerStakesKey("opp-1", "M2", 1512, 1498));
  });
});

describe("useViewerStakes", () => {
  it("reads get_rating_stakes with the opponent id and the match id, never the retired RPC", async () => {
    const stakes = ratingStakes();
    mockGetRatingStakes.mockResolvedValue(stakes);
    const { result } = mount();
    expect(result.current).toBeNull();
    await flush();
    expect(mockGetRatingStakes).toHaveBeenCalledTimes(1);
    expect(mockGetRatingStakes).toHaveBeenCalledWith(expect.anything(), "opp-1", "M1");
    expect(mockGetEloStakes).not.toHaveBeenCalled();
    expect(result.current).toBe(stakes);
  });

  it("passes a null match id when there is no match yet (Arena)", async () => {
    mockGetRatingStakes.mockResolvedValue(ratingStakes());
    mount({ ...BASE, match: null });
    await flush();
    expect(mockGetRatingStakes).toHaveBeenCalledWith(expect.anything(), "opp-1", null);
  });

  it("keeps a positive draw (an underdog's draw gains) exactly as the server sent it", async () => {
    mockGetRatingStakes.mockResolvedValue(ratingStakes({ win: 31, draw: 4, loss: -6 }));
    const { result } = mount();
    await flush();
    expect(result.current?.draw).toBe(4);
  });

  it("is null on a null response and on an error (the strips hide, no error UI)", async () => {
    mockGetRatingStakes.mockResolvedValue(null);
    const a = mount();
    await flush();
    expect(a.result.current).toBeNull();
    mockGetRatingStakes.mockRejectedValue(new Error("function public.get_rating_stakes does not exist"));
    const b = mount();
    await flush();
    expect(b.result.current).toBeNull();
  });

  it("reads nothing when disabled or without an opponent", async () => {
    mount({ ...BASE, enabled: false });
    mount({ ...BASE, opp: null });
    await flush();
    expect(mockGetRatingStakes).not.toHaveBeenCalled();
  });

  it("drops the old stakes on the very render the key changes, and reads again after a rating change", async () => {
    const first = ratingStakes({ win: 14 });
    const second = ratingStakes({ win: 12 });
    mockGetRatingStakes.mockResolvedValueOnce(first);
    const { result, rerender } = mount();
    await flush();
    expect(result.current).toBe(first);

    // Another opponent: gone at once, before any read resolves.
    mockGetRatingStakes.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ ...BASE, opp: "opp-2" });
    expect(result.current).toBeNull();
    expect(mockGetRatingStakes).toHaveBeenLastCalledWith(expect.anything(), "opp-2", "M1");

    // Back to the first opponent but my rating moved (a match in between):
    // never the stale stakes, a fresh read.
    mockGetRatingStakes.mockResolvedValueOnce(second);
    rerender({ ...BASE, my: 1530 });
    expect(result.current).toBeNull();
    await flush();
    expect(mockGetRatingStakes).toHaveBeenCalledTimes(3);
    expect(result.current).toBe(second);
  });

  it("a new extra key (a reweigh) drops the stakes at once and reads again", async () => {
    const first = ratingStakes({ win: 14 });
    const second = ratingStakes({ win: 19 });
    mockGetRatingStakes.mockResolvedValueOnce(first);
    const { result, rerender } = mount();
    await flush();
    expect(result.current).toBe(first);
    let resolve!: (v: unknown) => void;
    mockGetRatingStakes.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    rerender({ ...BASE, extra: "170|190" });
    expect(result.current).toBeNull();
    expect(mockGetRatingStakes).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve(second);
    });
    expect(result.current).toBe(second);
  });
});
