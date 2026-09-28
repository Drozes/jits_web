import type { MatchLibraryItem, MatchLibraryVideo } from "@jits/shared/api/film-room";

/** Library fixtures shared by the Film Room suites. */
export function libVideo(over: Partial<MatchLibraryVideo> = {}): MatchLibraryVideo {
  return {
    video_id: "v-1",
    uploaded_by: "me-1",
    status: "analyzed",
    playability: "playable",
    thumbnail_key: "k.jpg",
    thumbnail_width: 720,
    thumbnail_height: 1280,
    duration_seconds: 377,
    has_analysis: true,
    analysis_tier: "premium",
    chunk_count: 5,
    chunks_completed: 5,
    poster_url: "https://signed/k.jpg",
    ...over,
  };
}

export function libItem(over: Partial<MatchLibraryItem> = {}): MatchLibraryItem {
  return {
    match_id: "m-1",
    completed_at: "2026-09-27T10:06:00Z",
    match_type: "ranked",
    status: "completed",
    outcome: "win",
    submission_name: "Rear-naked choke",
    finish_time_seconds: 377,
    duration_seconds: 600,
    elo_before: 1512,
    elo_after: 1526,
    elo_delta: 14,
    opponent: { id: "opp-1", display_name: "Mina Park", profile_photo_url: null },
    videos: [libVideo()],
    highlight_count: 0,
    ...over,
  };
}
