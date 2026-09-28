/**
 * jits-8t0m: the viewer must sign through the shared wrapper (which prefers
 * normalized_path over storage_path), never read match_videos itself.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const fromSpy = vi.fn();
const fakeClient = { from: fromSpy, rpc: vi.fn(), storage: { from: vi.fn() } };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fakeClient }));
let mockProgressData: unknown = null;
vi.mock("@jits/shared/hooks/use-video-progress", () => ({
  useVideoProgress: () => ({ data: mockProgressData, loading: false, refresh: vi.fn(), rpcMissing: false }),
}));

const mockSigned = vi.fn();
vi.mock("@jits/shared/api/queries", () => ({
  getMatchVideoSignedUrlResult: (...a: unknown[]) => mockSigned(...a),
}));

import { VideoAnalysisViewer, recommendationText } from "./video-analysis-viewer";

beforeEach(() => {
  mockSigned.mockReset();
  fromSpy.mockReset();
  fakeClient.rpc.mockReset();
  mockProgressData = null;
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

describe("VideoAnalysisViewer no match detected (jr_be-0qf)", () => {
  function analysed(analysis: Record<string, unknown>) {
    mockProgressData = {
      status: "analyzed",
      chunk_count: 1,
      chunks: [],
      chunks_completed: 1,
      failed_chunk_count: 0,
      requested_tier: "standard",
      latest_error_message: null,
      match_detected: analysis.match_detected ?? null,
      no_match_reason: null,
    };
    fakeClient.rpc.mockResolvedValue({
      data: {
        analysis: {
          id: "a1",
          video_id: "vid-9",
          summary: "Summary text.",
          positions: [],
          scoring_moments: [],
          recommendations: [],
          biomechanical_timeline: [],
          model_used: null,
          analysis_tier: "standard",
          tokens_used: null,
          cost_cents: null,
          completed_at: null,
          ...analysis,
        },
        technique_tags: [],
      },
      error: null,
    });
    mockSigned.mockResolvedValue({ ok: true, data: "https://x/v.mp4" });
    return render(<VideoAnalysisViewer videoId="vid-9" />);
  }

  it("replaces the tabs with a plain no-match state, the reason and filming tips", async () => {
    const r = analysed({
      match_detected: false,
      no_match_reason: "An empty office; nobody is grappling.",
      recommendations: [{ athlete_id: "a", suggestion: "Frame both athletes." }, { text: "More light." }],
    });
    await waitFor(() => expect(r.getByTestId("analysis-no-match")).toBeInTheDocument());
    expect(r.getByText("We didn't see a match in this video")).toBeInTheDocument();
    expect(r.getByTestId("analysis-no-match-reason")).toHaveTextContent("An empty office; nobody is grappling.");
    expect(r.getByText("Frame both athletes.")).toBeInTheDocument();
    expect(r.getByText("More light.")).toBeInTheDocument();
    expect(r.queryByRole("tab")).toBeNull();
    expect(r.queryByText("Summary text.")).toBeNull();
  });

  it("falls back to a plain sentence without a reason", async () => {
    const r = analysed({ match_detected: false, no_match_reason: null });
    await waitFor(() => expect(r.getByTestId("analysis-no-match")).toBeInTheDocument());
    expect(r.getByTestId("analysis-no-match-reason")).toHaveTextContent(
      "The analysis found no jiu-jitsu in this recording.",
    );
    expect(r.queryByTestId("analysis-no-match-tips")).toBeNull();
  });

  it.each([
    ["true", true],
    ["null", null],
    ["absent", undefined],
  ])("match_detected %s keeps the normal tabs", async (_label, value) => {
    const r = analysed({ match_detected: value });
    await waitFor(() => expect(r.getAllByRole("tab").length).toBe(4));
    expect(r.queryByTestId("analysis-no-match")).toBeNull();
    expect(r.getByText("Summary text.")).toBeInTheDocument();
  });
});

describe("recommendationText", () => {
  it("prefers a non-empty suggestion, then text, and guards non-strings", () => {
    expect(recommendationText({ suggestion: "  Frame both.  ", text: "old" })).toBe("Frame both.");
    expect(recommendationText({ suggestion: "   ", text: " More light. " })).toBe("More light.");
    expect(recommendationText({ suggestion: 42, text: "Fallback." })).toBe("Fallback.");
    expect(recommendationText({ suggestion: null, text: { nested: true } })).toBe("");
    expect(recommendationText(null)).toBe("");
    expect(recommendationText("junk")).toBe("");
  });

  it("drops empty and malformed tips from the no-match state and the Tips tab", async () => {
    mockProgressData = { status: "analyzed", chunk_count: 1, chunks: [], chunks_completed: 1, failed_chunk_count: 0, requested_tier: "standard", latest_error_message: null };
    const recs = [{ suggestion: "Keep.", text: "" }, { suggestion: "  " }, { text: 7 }, null];
    mockSigned.mockResolvedValue({ ok: true, data: "https://x/v.mp4" });
    fakeClient.rpc.mockResolvedValue({
      data: { analysis: { id: "a", video_id: "vid-9", summary: "S.", positions: [], scoring_moments: [], recommendations: recs, match_detected: false }, technique_tags: [] },
      error: null,
    });
    const r = render(<VideoAnalysisViewer videoId="vid-9" />);
    const tips = await waitFor(() => r.getByTestId("analysis-no-match-tips"));
    expect(tips.querySelectorAll("li")).toHaveLength(1);
    expect(tips).toHaveTextContent("Keep.");

    r.unmount();
    fakeClient.rpc.mockResolvedValue({
      data: { analysis: { id: "a", video_id: "vid-9", summary: "S.", positions: [], scoring_moments: [], recommendations: recs, match_detected: true }, technique_tags: [] },
      error: null,
    });
    const t = render(<VideoAnalysisViewer videoId="vid-9" />);
    await waitFor(() => expect(t.getByRole("tab", { name: "Tips (1)" })).toBeInTheDocument());
  });
});
