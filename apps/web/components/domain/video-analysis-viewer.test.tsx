/**
 * jits-8t0m: the viewer must sign through the shared wrapper (which prefers
 * normalized_path over storage_path), never read match_videos itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const fromSpy = vi.fn();
const fakeClient = { from: fromSpy, rpc: vi.fn(), storage: { from: vi.fn() } };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
vi.mock("@jits/shared/hooks/use-video-progress", () => ({
  useVideoProgress: () => ({ data: null, loading: false, refresh: vi.fn(), rpcMissing: false }),
}));

const mockSigned = vi.fn();
vi.mock("@jits/shared/api/queries", () => ({
  getMatchVideoSignedUrlResult: (...a: unknown[]) => mockSigned(...a),
}));

import { VideoAnalysisViewer } from "./video-analysis-viewer";

beforeEach(() => {
  mockSigned.mockReset();
  fromSpy.mockReset();
});

describe("VideoAnalysisViewer playback URL", () => {
  it("signs via getMatchVideoSignedUrlResult and plays the result", async () => {
    mockSigned.mockResolvedValue({ ok: true, data: "https://x/normalized.mp4" });
    const { container } = render(<VideoAnalysisViewer videoId="vid-9" />);
    await waitFor(() =>
      expect(container.querySelector("video")).toHaveAttribute("src", "https://x/normalized.mp4"),
    );
    expect(mockSigned).toHaveBeenCalledWith(fakeClient, "vid-9", 3600);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("keeps the loading placeholder when there is no recording or the sign fails", async () => {
    mockSigned.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    const { container, getByText } = render(<VideoAnalysisViewer videoId="vid-9" />);
    await waitFor(() => expect(mockSigned).toHaveBeenCalled());
    expect(container.querySelector("video")).toBeNull();
    expect(getByText("Loading video…")).toBeInTheDocument();
  });

  it("uses a caller-supplied src without signing", () => {
    const { container } = render(<VideoAnalysisViewer videoId="vid-9" videoSrc="https://x/given.mp4" />);
    expect(container.querySelector("video")).toHaveAttribute("src", "https://x/given.mp4");
    expect(mockSigned).not.toHaveBeenCalled();
  });
});
