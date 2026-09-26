import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { MatchDetailVideo } from "@jits/shared/api/queries";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const mockPlayback = vi.fn();
vi.mock("@jits/shared/api/queries", () => ({
  getMatchVideoPlaybackResult: (...a: unknown[]) => mockPlayback(...a),
}));

import { MatchVideoCard, MAX_SILENT_RESIGNS } from "./match-video-card";

function setTime(el: HTMLVideoElement, t: number) {
  Object.defineProperty(el, "currentTime", { value: t, writable: true, configurable: true });
}

const playSpy = vi.fn(() => Promise.resolve());

function makeVideo(over: Partial<MatchDetailVideo> = {}): MatchDetailVideo {
  return {
    id: "vid-1",
    uploaded_by: "opp-1",
    uploaded_by_name: "Demo Red",
    status: "ready",
    playability: "playable",
    duration_seconds: 185,
    camera_angle: null,
    has_analysis: false,
    is_mine: false,
    angle_label: "Demo Red's recording",
    poster_url: null,
    ...over,
  };
}

function ok(url: string) {
  return { ok: true, data: { url, posterUrl: null, status: "ready", playability: "playable" } };
}

beforeEach(() => {
  mockPlayback.mockReset();
  playSpy.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { value: playSpy, configurable: true, writable: true });
});

describe("MatchVideoCard", () => {
  it("shows the signed poster when present, else the placeholder", () => {
    const { unmount } = render(
      <MatchVideoCard video={makeVideo({ poster_url: "https://x/poster.jpg" })} initialUrl="https://x/v.mp4" initialError={null} primary />,
    );
    expect(screen.getByTestId("match-video-poster")).toHaveAttribute("src", "https://x/poster.jpg");
    unmount();
    render(<MatchVideoCard video={makeVideo()} initialUrl="https://x/v.mp4" initialError={null} primary />);
    expect(screen.getByTestId("match-video-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("match-video-poster")).toBeNull();
  });

  it("renders the label, mono duration and an accessible Watch", () => {
    render(<MatchVideoCard video={makeVideo()} initialUrl="https://x/v.mp4" initialError={null} primary />);
    expect(screen.getByText("Demo Red's recording")).toBeInTheDocument();
    expect(screen.getByText("3:05")).toHaveClass("font-mono", "tabular-nums");
    expect(screen.getByRole("button", { name: "Watch Demo Red's recording" })).toBeInTheDocument();
  });

  it("uses the primary variant only when primary, outline otherwise", () => {
    const { unmount } = render(
      <MatchVideoCard video={makeVideo({ is_mine: true, angle_label: "Your recording" })} initialUrl="u" initialError={null} primary />,
    );
    const primary = screen.getByRole("button", { name: "Watch your recording" });
    expect(primary).toHaveClass("bg-primary");
    expect(primary).toHaveClass("shadow-none");
    unmount();
    render(<MatchVideoCard video={makeVideo()} initialUrl="u" initialError={null} primary={false} />);
    const secondary = screen.getByRole("button", { name: "Watch Demo Red's recording" });
    expect(secondary).not.toHaveClass("bg-primary");
    expect(secondary).toHaveClass("border");
  });

  it("Watch mounts a controlled <video> with the server-signed URL, no re-sign", () => {
    const { container } = render(
      <MatchVideoCard video={makeVideo({ poster_url: "https://x/p.jpg" })} initialUrl="https://x/v.mp4" initialError={null} primary />,
    );
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("src", "https://x/v.mp4");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("poster", "https://x/p.jpg");
    expect(mockPlayback).not.toHaveBeenCalled();
  });

  it("re-signs once silently on a playback error, then shows the retry panel", async () => {
    mockPlayback.mockResolvedValue(ok("https://x/fresh.mp4"));
    const { container } = render(
      <MatchVideoCard video={makeVideo()} initialUrl="https://x/stale.mp4" initialError={null} primary />,
    );
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    fireEvent.error(container.querySelector("video")!);
    await waitFor(() =>
      expect(container.querySelector("video")).toHaveAttribute("src", "https://x/fresh.mp4"),
    );
    expect(mockPlayback).toHaveBeenCalledTimes(1);
    expect(mockPlayback).toHaveBeenCalledWith(expect.anything(), "vid-1");

    fireEvent.error(container.querySelector("video")!);
    expect(await screen.findByText("Couldn't play this video")).toBeInTheDocument();
    expect(screen.getByText("The link may have expired or your connection dropped.")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
    expect(mockPlayback).toHaveBeenCalledTimes(1);

    // Try again always re-signs.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(mockPlayback).toHaveBeenCalledTimes(2);
  });

  it("error, play, error at the same position ends on the panel (no loop)", async () => {
    mockPlayback.mockResolvedValue(ok("https://x/fresh.mp4"));
    const { container } = render(
      <MatchVideoCard video={makeVideo()} initialUrl="https://x/stale.mp4" initialError={null} primary />,
    );
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    const el = () => container.querySelector("video")!;
    setTime(el(), 42);
    fireEvent.error(el());
    await waitFor(() => expect(el()).toHaveAttribute("src", "https://x/fresh.mp4"));
    // Plays again from the resume point, but makes no real progress.
    fireEvent.playing(el());
    setTime(el(), 43);
    fireEvent.timeUpdate(el());
    fireEvent.error(el());
    expect(await screen.findByText("Couldn't play this video")).toBeInTheDocument();
    expect(mockPlayback).toHaveBeenCalledTimes(1);
  });

  it("real progress refunds the budget, but silent re-signs cap at 2 per mount", async () => {
    mockPlayback.mockResolvedValue(ok("https://x/fresh.mp4"));
    const { container } = render(
      <MatchVideoCard video={makeVideo()} initialUrl="https://x/stale.mp4" initialError={null} primary />,
    );
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    const el = () => container.querySelector("video")!;
    for (const [at, calls] of [[10, 1], [100, 2]] as const) {
      setTime(el(), at);
      fireEvent.error(el());
      await waitFor(() => expect(mockPlayback).toHaveBeenCalledTimes(calls));
      setTime(el(), at + 30);
      fireEvent.timeUpdate(el());
    }
    expect(screen.queryByText("Couldn't play this video")).toBeNull();
    fireEvent.error(el());
    expect(await screen.findByText("Couldn't play this video")).toBeInTheDocument();
    expect(mockPlayback).toHaveBeenCalledTimes(MAX_SILENT_RESIGNS);
  });

  it("calls play() after mounting the video so iOS needs no second tap", () => {
    render(<MatchVideoCard video={makeVideo()} initialUrl="https://x/v.mp4" initialError={null} primary />);
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    expect(playSpy).toHaveBeenCalled();
  });

  it("processing: amber chip and a disabled Processing button, no Watch", () => {
    render(
      <MatchVideoCard video={makeVideo({ status: "uploading", playability: "processing" })} initialUrl={null} initialError={null} primary={false} />,
    );
    expect(screen.getByText("Uploading")).toHaveClass("text-amber-500");
    expect(screen.getByText("Still uploading. Refresh the page to check again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Processing..." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /watch/i })).toBeNull();
  });

  it("merging shows the PROCESSING chip", () => {
    render(
      <MatchVideoCard video={makeVideo({ status: "merging", playability: "processing" })} initialUrl={null} initialError={null} primary={false} />,
    );
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("file missing: panel, no Watch", () => {
    render(<MatchVideoCard video={makeVideo()} initialUrl={null} initialError="VIDEO_FILE_MISSING" primary />);
    expect(screen.getByText("Video file not found")).toBeInTheDocument();
    expect(screen.getByText("The upload didn't finish, so this recording can't be played.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("row absent: Video unavailable panel, no Watch", () => {
    render(<MatchVideoCard video={makeVideo()} initialUrl={null} initialError={null} primary />);
    expect(screen.getByText("Video unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a retryable initial error still offers Watch, which signs on the client", async () => {
    mockPlayback.mockResolvedValue({ ok: false, error: { code: "VIDEO_FILE_MISSING", message: "x" } });
    render(<MatchVideoCard video={makeVideo()} initialUrl={null} initialError="UNKNOWN" primary />);
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    expect(await screen.findByText("Video file not found")).toBeInTheDocument();
    expect(mockPlayback).toHaveBeenCalledTimes(1);
  });

  it("a client sign that finds no row shows Video unavailable", async () => {
    mockPlayback.mockResolvedValue({ ok: true, data: null });
    render(<MatchVideoCard video={makeVideo()} initialUrl={null} initialError="UNKNOWN" primary />);
    fireEvent.click(screen.getByRole("button", { name: /watch/i }));
    expect(await screen.findByText("Video unavailable")).toBeInTheDocument();
  });

  it("failed status keeps Watch and explains", () => {
    render(
      <MatchVideoCard video={makeVideo({ status: "failed", playability: "failed" })} initialUrl="u" initialError={null} primary />,
    );
    expect(screen.getByText("Processing failed. The original recording may still play.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch/i })).toBeEnabled();
  });
});
