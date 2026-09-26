/**
 * The async server component, awaited directly and rendered: error mapping,
 * which videos get signed server-side, and the one-primary-Watch rule.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/guards", () => ({
  requireAthlete: async () => ({ user: { id: "u-1" }, athlete: { id: "me-1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ server: true }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

const mockView = vi.fn();
const mockPlayback = vi.fn();
vi.mock("@jits/shared/api/queries", () => ({
  getMatchDetailView: (...a: unknown[]) => mockView(...a),
  getMatchVideoPlaybackResult: (...a: unknown[]) => mockPlayback(...a),
}));

import { MatchDetailContent } from "./match-detail-content";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";

function video(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    uploaded_by: "me-1",
    uploaded_by_name: null,
    status: "ready",
    playability: "playable",
    duration_seconds: null,
    camera_angle: null,
    has_analysis: false,
    is_mine: true,
    angle_label: "Your recording",
    poster_url: null,
    ...over,
  };
}

function view(videos: unknown[]) {
  return {
    ok: true,
    data: {
      match: {
        id: MATCH_ID,
        match_type: "ranked",
        duration_seconds: 0,
        status: "completed",
        result: "submission",
        started_at: null,
        completed_at: "2026-09-20T10:05:00Z",
      },
      me: { athlete_id: "me-1", display_name: "Me", outcome: "win", elo_delta: 10, elo_before: null, elo_after: null },
      opponent: { athlete_id: "opp-1", display_name: "Demo Red", current_elo: 1300, profile_photo_url: null },
      videos,
    },
  };
}

async function renderContent() {
  const el = await MatchDetailContent({ paramsPromise: Promise.resolve({ id: MATCH_ID }) });
  return render(el);
}

beforeEach(() => {
  mockView.mockReset();
  mockPlayback.mockReset();
});

describe("MatchDetailContent", () => {
  it("MATCH_NOT_FOUND goes to the 404 page", async () => {
    mockView.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_FOUND", message: "" } });
    await expect(renderContent()).rejects.toBe(NOT_FOUND);
    expect(mockView).toHaveBeenCalledWith({ server: true }, MATCH_ID, "me-1");
  });

  it("NOT_PARTICIPANT renders the can't-view panel with Back", async () => {
    mockView.mockResolvedValue({ ok: false, error: { code: "NOT_PARTICIPANT", message: "" } });
    await renderContent();
    expect(screen.getByText("You can't view this match")).toBeInTheDocument();
    expect(screen.getByText("Only the two athletes in a match can see its details and video.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("other errors render the load error with a Try again link to the same URL", async () => {
    mockView.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "" } });
    await renderContent();
    expect(screen.getByText("Couldn't load this match")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", `/matches/${MATCH_ID}`);
  });

  it("no videos: the no-video plate and the singular heading", async () => {
    mockView.mockResolvedValue(view([]));
    await renderContent();
    expect(screen.getByTestId("match-detail-no-video")).toHaveTextContent("No video was recorded for this match.");
    expect(screen.getByText("Match video")).toBeInTheDocument();
    expect(mockPlayback).not.toHaveBeenCalled();
  });

  it("signs only non-processing videos and gives exactly one primary Watch", async () => {
    mockView.mockResolvedValue(
      view([
        video("v-proc", { status: "uploading", playability: "processing" }),
        video("v-mine"),
        video("v-opp", { uploaded_by: "opp-1", is_mine: false, angle_label: "Demo Red's recording" }),
      ]),
    );
    mockPlayback.mockImplementation(async (_s: unknown, id: string) => ({
      ok: true,
      data: { url: `https://x/${id}.mp4`, posterUrl: null, status: "ready", playability: "playable" },
    }));
    await renderContent();
    expect(mockPlayback).toHaveBeenCalledTimes(2);
    expect(mockPlayback).not.toHaveBeenCalledWith(expect.anything(), "v-proc");
    expect(screen.getByText("Match videos")).toBeInTheDocument();

    const mine = screen.getByRole("button", { name: "Watch your recording" });
    const opp = screen.getByRole("button", { name: "Watch Demo Red's recording" });
    expect(mine).toHaveClass("bg-primary");
    expect(opp).not.toHaveClass("bg-primary");
  });

  it("a missing first file hands the primary Watch to the next card", async () => {
    mockView.mockResolvedValue(
      view([
        video("v-mine"),
        video("v-opp", { uploaded_by: "opp-1", is_mine: false, angle_label: "Demo Red's recording" }),
      ]),
    );
    mockPlayback.mockImplementation(async (_s: unknown, id: string) =>
      id === "v-mine"
        ? { ok: false, error: { code: "VIDEO_FILE_MISSING", message: "" } }
        : { ok: true, data: { url: "https://x/o.mp4", posterUrl: null, status: "ready", playability: "playable" } },
    );
    await renderContent();
    expect(screen.getByText("Video file not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Watch Demo Red's recording" })).toHaveClass("bg-primary");
  });
});
