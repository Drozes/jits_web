import { notFound } from "next/navigation";
import { requireAthlete } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";
import {
  getMatchDetailView,
  getMatchVideoPlaybackResult,
  type MatchDetailVideo,
} from "@jits/shared/api/queries";
import type { DomainErrorCode } from "@jits/shared/api/errors";
import { MatchResultHeader } from "./match-result-header";
import { MatchVideoCard } from "./match-video-card";
import { hasWatchAction } from "./match-video-state";
import { MatchDetailErrorPanel, NoVideoPlate } from "./match-detail-states";

interface InitialPlayback {
  initialUrl: string | null;
  initialError: DomainErrorCode | null;
}

/**
 * Sign each video server-side for the first paint. The URL is per-viewer
 * (storage RLS re-checks participance), and this component reads cookies, so
 * it is rendered per request and never cached across users.
 */
async function signInitial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  video: MatchDetailVideo,
): Promise<InitialPlayback> {
  if (video.playability === "processing") {
    return { initialUrl: null, initialError: null };
  }
  const res = await getMatchVideoPlaybackResult(supabase, video.id);
  if (!res.ok) return { initialUrl: null, initialError: res.error.code };
  return { initialUrl: res.data?.url ?? null, initialError: null };
}

export async function MatchDetailContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id } = await paramsPromise;
  const { athlete } = await requireAthlete();
  const supabase = await createClient();

  const result = await getMatchDetailView(supabase, id, athlete.id);
  if (!result.ok) {
    if (result.error.code === "MATCH_NOT_FOUND") notFound();
    return (
      <>
        <AppHeader title="Match" back />
        <MatchDetailErrorPanel
          kind={result.error.code === "NOT_PARTICIPANT" ? "not-participant" : "error"}
          retryHref={`/matches/${id}`}
        />
      </>
    );
  }

  const view = result.data;
  const initial = await Promise.all(view.videos.map((v) => signInitial(supabase, v)));
  // One Signal Red CTA per surface: only the first card that can Watch gets it.
  const primaryIndex = view.videos.findIndex((v, i) =>
    hasWatchAction(v, initial[i].initialUrl, initial[i].initialError),
  );

  return (
    <>
      <AppHeader title="Match" back />
      <div
        className="flex flex-col animate-page-in"
        style={{ gap: "var(--space-4)", padding: "var(--space-4) var(--space-3)" }}
      >
        <MatchResultHeader view={view} />

        <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          <h2
            className="font-mono uppercase"
            style={{
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              letterSpacing: "var(--ls-caps-xl)",
              margin: 0,
            }}
          >
            {view.videos.length > 1 ? "Match videos" : "Match video"}
          </h2>
          {view.videos.length === 0 ? (
            <NoVideoPlate />
          ) : (
            view.videos.map((video, i) => (
              <MatchVideoCard
                key={video.id}
                video={video}
                initialUrl={initial[i].initialUrl}
                initialError={initial[i].initialError}
                primary={i === primaryIndex}
              />
            ))
          )}
        </section>
      </div>
    </>
  );
}
