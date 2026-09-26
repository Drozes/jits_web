/**
 * Page objects for match history -> match detail -> player (E17, V-epic
 * jits-5tj9.10). Kept out of `sim/screens.ts` on purpose (spec 7.3).
 *
 * idb only sees accessibility ELEMENTS: a plain container View's testID and
 * label never surface, and Text testIDs do not either. So the app exposes:
 *   - `match-detail-screen`: an accessible 1x1 marker, label
 *     "Match detail vs <opponent name>" once the match has loaded;
 *   - `video-player-state`: an accessible 1x1 marker, label
 *     "Video state: loading|loaded|error|absent|processing|missing";
 *   - `match-video-watch-<videoId>`: each Watch button, label
 *     "Watch your recording" / "Watch <Name>'s recording";
 *   - history rows labelled "Open match vs <name>" (Pressables), Past Match
 *     Videos rows `past-video-row-<matchId>` ("Open match video vs <name>").
 * Selectors take the testID OR the label, never a container testID.
 */
import type { AXElement, Idb, Query } from "./idb";
import { matches, summarise } from "./idb";
import type { Screens } from "./screens";
import { ExpectationTimeout, pollUntil } from "../lib/util";

export const DETAIL_MARKER_ID = "match-detail-screen";
export const PLAYER_STATE_ID = "video-player-state";
const DETAIL_LABEL_RE = /^Match detail vs (.+)$/i;
const PLAYER_LABEL_RE = /^Video state: (\w+)$/i;

/**
 * Player failure panels: the testIDs sit on container Views (not visible to
 * idb), so each is also matched by its title copy, which renders as a Text.
 */
export const PLAYER_ERROR_PANELS: { id: string; title: string }[] = [
  { id: "video-load-failed", title: "Couldn't play this video" },
  { id: "video-file-missing", title: "Video file not found" },
  { id: "video-unavailable", title: "Video unavailable" },
  { id: "video-processing", title: "Still uploading" },
];

export function watchButtonId(videoId: string): string {
  return `match-video-watch-${videoId}`;
}

/** "Watch your recording" for the viewer's own video, else "Watch <Name>'s recording". */
export function watchLabelFor(uploaderName: string | null): string {
  return uploaderName ? `Watch ${uploaderName}'s recording` : "Watch your recording";
}

/** History row label regex for one opponent ("Open match vs X" / "Open match video vs X"). */
export function historyRowLabel(opponent: string, video = false): RegExp {
  const name = opponent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Open match ${video ? "video " : ""}vs ${name}$`, "i");
}

/** Parse the detail marker label; null while the match is loading. */
export function detailOpponent(label: string | null | undefined): string | null {
  return label?.match(DETAIL_LABEL_RE)?.[1] ?? null;
}

/** Parse the player marker label ("loaded", "error", ...). */
export function playerState(label: string | null | undefined): string | null {
  return label?.match(PLAYER_LABEL_RE)?.[1]?.toLowerCase() ?? null;
}

export interface DetailView {
  /** Opponent named by the marker, or null when the marker never loaded. */
  opponent: string | null;
  /** Watch labels found per requested video id (null = no such button). */
  watch: Record<string, string | null>;
}

export class MatchDetailPages {
  constructor(
    readonly idb: Idb,
    readonly ui: Screens,
  ) {}

  private find(els: AXElement[], q: Query): AXElement | undefined {
    return els.find((e) => matches(e, q));
  }

  private detailMarker(els: AXElement[]): AXElement | undefined {
    return (
      els.find((e) => e.AXUniqueId === DETAIL_MARKER_ID && detailOpponent(e.AXLabel)) ??
      els.find((e) => detailOpponent(e.AXLabel) !== null)
    );
  }

  /** Scroll the current screen until `q` is on screen: down first, then back up. */
  async scrollToAny(q: Query): Promise<AXElement> {
    try {
      return await this.idb.scrollTo(q, 6, "up");
    } catch (e) {
      if (!(e instanceof ExpectationTimeout)) throw e;
      return this.idb.scrollTo(q, 10, "down");
    }
  }

  /** Swipe the current scroll view back to its top. */
  async scrollToTop(swipes = 4): Promise<void> {
    const x = this.idb.screenW / 2;
    for (let i = 0; i < swipes; i++) await this.idb.swipe(x, this.idb.screenH * 0.3, x, this.idb.screenH * 0.8, 0.2);
  }

  /** Tap the first (newest) history row for `opponent` on the current screen. */
  async tapFirstRow(opponent: string, timeoutMs = 15_000): Promise<void> {
    const q: Query = { label: historyRowLabel(opponent), type: "Button" };
    await this.idb.waitFor(q, timeoutMs).catch(() => undefined);
    await this.idb.tap(await this.scrollToAny(q));
  }

  /**
   * Wait for the detail marker to report a loaded match, then read the Watch
   * buttons of `videoIds` (by testID, falling back to nothing: a missing
   * button is reported as null, never guessed from another element).
   */
  async readDetail(videoIds: string[], timeoutMs = 15_000): Promise<DetailView> {
    let last: AXElement[] = [];
    const els = await pollUntil(
      "match detail marker (Match detail vs <name>)",
      async () => {
        last = await this.idb.describe();
        return this.detailMarker(last) ? last : undefined;
      },
      { timeoutMs, lastSeen: () => summarise(last) },
    );
    const opponent = detailOpponent(this.detailMarker(els)?.AXLabel);
    // The cards sit below the header; bring them on screen before reading.
    const watch: Record<string, string | null> = {};
    for (const id of videoIds) {
      const el = this.find(els, { id: watchButtonId(id) }) ?? (await this.idb.scrollTo({ id: watchButtonId(id) }, 3).catch(() => undefined));
      watch[id] = el?.AXLabel ?? null;
    }
    return { opponent, watch };
  }

  /** Pop pushed screens (header "Go back") until a tab root is showing. */
  async backToTabRoot(max = 5): Promise<void> {
    for (let i = 0; i < max; i++) {
      const els = await this.idb.describe();
      const back = els.find((e) => e.AXLabel === "Go back" && e.type !== "StaticText");
      if (!back) return;
      await this.idb.tap(back);
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  async back(): Promise<void> {
    await this.idb.tapQ({ label: "Go back", type: "Button" }, 10_000);
    await new Promise((r) => setTimeout(r, 900));
  }

  // --- entry points ------------------------------------------------------------

  /**
   * Open a tab and pull-to-refresh it. Tab refocus refetches are throttled
   * (once per 30 s, jits-5tj9.8), so a match finished seconds ago only shows
   * up in a tab's lists after an explicit refresh.
   */
  async refreshTab(tab: "Home" | "Profile"): Promise<void> {
    await this.ui.tab(tab);
    await this.scrollToTop();
    await this.idb.pullToRefresh();
    await new Promise((r) => setTimeout(r, 1_500));
  }

  /** Home (refreshed) -> Recent Activity "Me" scope (the default is "All") -> newest row. */
  async openFromHome(opponent: string): Promise<void> {
    await this.refreshTab("Home");
    const me = await this.scrollToAny({ label: "Me", type: "Button" });
    await this.idb.tap(me);
    await this.tapFirstRow(opponent);
  }

  /** Profile (refreshed) -> Recent Matches -> newest row. */
  async openFromProfile(opponent: string): Promise<void> {
    await this.refreshTab("Profile");
    await this.tapFirstRow(opponent);
  }

  /** Profile -> "View Detailed Stats" -> full history -> newest row. */
  async openFromStats(opponent: string): Promise<void> {
    await this.ui.tab("Profile");
    const btn = await this.scrollToAny({ label: /^view detailed stats$/i, type: "Button" });
    await this.idb.tap(btn);
    await this.idb.waitFor({ label: "Go back", type: "Button" }, 10_000);
    await this.tapFirstRow(opponent);
  }

  /** From a loaded detail screen: opponent row -> athlete page -> newest head-to-head row. */
  async openFromAthlete(opponent: string): Promise<void> {
    await this.idb.tap(await this.scrollToAny({ label: `View ${opponent}'s profile`, type: "Button" }));
    // The detail we came from must be off screen, or the next read could see it.
    await this.idb.waitGone({ label: DETAIL_LABEL_RE }, 10_000);
    await this.tapFirstRow(opponent, 20_000);
  }

  /** Profile -> pull-to-refresh -> Past Match Videos row for `matchId`. */
  async openFromPastVideos(matchId: string): Promise<void> {
    await this.refreshTab("Profile");
    await this.idb.tap(await this.scrollToAny({ id: `past-video-row-${matchId}` }));
  }

  // --- player ------------------------------------------------------------------

  async tapWatch(videoId: string, label: string): Promise<void> {
    const els = await this.idb.describe();
    const el = this.find(els, { id: watchButtonId(videoId) }) ?? this.find(els, { label, type: "Button" });
    await this.idb.tap(el ?? (await this.scrollToAny({ id: watchButtonId(videoId) })));
  }

  /** Poll the player marker until it reads `want`; returns the last state seen. */
  async waitPlayerState(want: string, timeoutMs: number): Promise<string | null> {
    let last: string | null = null;
    try {
      await pollUntil(
        `player state "${want}"`,
        async () => {
          const els = await this.idb.describe();
          const m =
            els.find((e) => e.AXUniqueId === PLAYER_STATE_ID) ?? els.find((e) => playerState(e.AXLabel) !== null);
          last = playerState(m?.AXLabel);
          return last === want ? last : undefined;
        },
        { timeoutMs, intervalMs: 500 },
      );
    } catch (e) {
      if (!(e instanceof ExpectationTimeout)) throw e;
    }
    return last;
  }

  /** Player failure panels currently on screen (by testID or title copy). */
  async playerErrorPanels(): Promise<string[]> {
    const els = await this.idb.describe();
    return PLAYER_ERROR_PANELS.filter(
      (p) =>
        els.some((e) => e.AXUniqueId === p.id) ||
        els.some((e) => (e.AXLabel ?? "").toLowerCase() === p.title.toLowerCase()),
    ).map((p) => p.id);
  }
}
