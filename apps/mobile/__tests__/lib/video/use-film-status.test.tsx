/**
 * useFilmStatus (jits-n2im.25): the shared status hook merged with THIS
 * phone's upload store for the viewer's own angle (the local job wins for
 * "Your angle"; the server wins for everything else), and a re-read when
 * the local job moves.
 */
const mockRefetch = jest.fn();
let mockResult: Record<string, unknown> = {};
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jits/shared/hooks/use-match-video-status", () => ({
  useMatchVideoStatus: () => mockResult,
  serverInstantToDevice: () => null,
}));
jest.mock("@/lib/video/upload-capabilities", () => ({ isBackgroundUploadSupported: () => false }));

import { act, renderHook } from "@testing-library/react-native";
import { useFilmStatus } from "@/lib/video/use-film-status";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { angle, MATCH_ID, ME, NOW, statusFixture } from "../../support/match-video-status-fixture";

beforeEach(() => {
  resetMatchUploadStore();
  mockRefetch.mockReset();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockResult = {
    status: statusFixture({ angles: [angle("me", "uploading", { progress_pct: 10 }), angle("opp", "upload_paused")] }),
    error: null,
    loading: false,
    clockOffsetMs: 0,
    refetch: mockRefetch,
  };
});
afterEach(() => jest.useRealTimers());

describe("useFilmStatus", () => {
  it("is null until the status arrives", () => {
    mockResult = { status: null, error: null, loading: true, clockOffsetMs: 0, refetch: mockRefetch };
    const { result } = renderHook(() => useFilmStatus(MATCH_ID, ME));
    expect(result.current.view).toBeNull();
  });

  it("the server describes my angle until this phone has a job, then the job wins", () => {
    const { result } = renderHook(() => useFilmStatus(MATCH_ID, ME));
    expect(result.current.view?.rows[0]).toMatchObject({ label: "Your angle", tag: "Uploading", percent: 10, action: null });
    act(() => {
      setMatchUpload(MATCH_ID, { status: "paused", progress: 0.3, error: "No connection right now. It picks up where it left off.", errorClass: "offline" });
    });
    expect(result.current.view?.rows[0]).toMatchObject({ tag: "Paused", action: "retry", helper: "No connection right now. It picks up where it left off." });
    // The other athlete's angle is the server's, untouched by this phone.
    expect(result.current.view?.rows[1]).toMatchObject({ label: "D. Okafor's angle", tag: "Paused" });
  });

  it("re-reads the status when this phone's job moves", () => {
    renderHook(() => useFilmStatus(MATCH_ID, ME));
    const before = mockRefetch.mock.calls.length;
    act(() => {
      setMatchUpload(MATCH_ID, { status: "uploading", progress: 0.1 });
    });
    act(() => {
      setMatchUpload(MATCH_ID, { status: "uploaded", progress: 1 });
    });
    expect(mockRefetch.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
  });
});
