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
const TAB_LABELS = ["Home", "Arena", "Rankings", "Profile"];
/** An element only that tab's root renders. */
const TAB_PROOF: Record<"Home" | "Profile", Query> = {
  Home: { label: "Me", type: "Button" },
  Profile: { label: /^(share profile|view detailed stats)$/i, type: "Button" },
};

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

  /**
   * Top of the tab bar, or the screen bottom on a pushed screen. A row whose
   * centre sits under the tab bar is NOT hittable: a tap there lands on a
   * tab (E17's first live run tapped "Rankings" instead of a Profile row).
   */
  private hittableBottom(els: AXElement[]): number {
    const tabs = els.filter(
      (e) =>
        TAB_LABELS.includes(e.AXLabel ?? "") &&
        e.type !== "StaticText" &&
        e.frame.y > this.idb.screenH * 0.75,
    );
    return tabs.length > 0 ? Math.min(...tabs.map((t) => t.frame.y)) : this.idb.screenH;
  }

  /**
   * Scroll the current screen until `q` is on screen AND hittable (clear of
   * the header and the tab bar): content up first, then back down. Returns the
   * settled element.
   */
  async scrollToAny(q: Query): Promise<AXElement> {
    let el: AXElement;
    try {
      el = await this.idb.scrollTo(q, 6, "up", 130);
    } catch (e) {
      if (!(e instanceof ExpectationTimeout)) throw e;
      el = await this.idb.scrollTo(q, 10, "down", 130);
    }
    const x = this.idb.screenW / 2;
    for (let i = 0; i < 4; i++) {
      const els = await this.idb.describe();
      const cur = els.find((e) => matches(e, q)) ?? el;
      const cy = cur.frame.y + cur.frame.height / 2;
      const bottom = this.hittableBottom(els) - 12;
      if (cy > 100 && cy < bottom) return cur;
      // Nudge it into the hittable band: small swipe towards the centre.
      const dy = cy >= bottom ? -Math.min(220, cy - bottom + 80) : Math.min(220, 180 - cy);
      const from = this.idb.screenH * 0.5;
      await this.idb.swipe(x, from, x, from + dy, 0.3);
      await new Promise((r) => setTimeout(r, 400));
      el = (await this.idb.settled(q)) ?? cur;
    }
    throw new ExpectationTimeout(`UI element ${JSON.stringify(q.label ?? q.id)} in the hittable band`, 4, null);
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
  async backToTabRoot(max = 6): Promise<void> {
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
    await this.openTab(tab);
    await this.scrollToTop();
    await this.idb.pullToRefresh();
    await new Promise((r) => setTimeout(r, 1_500));
  }

  /**
   * Tap the tab by its exact label, then prove the tab root is showing via an
   * element only that tab renders (retry the tap once).
   */
  async openTab(tab: "Home" | "Profile"): Promise<void> {
    const proof: Query = TAB_PROOF[tab];
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.backToTabRoot();
      await this.ui.tab(tab);
      try {
        await this.idb.waitFor(proof, 8_000);
        return;
      } catch (e) {
        if (!(e instanceof ExpectationTimeout) || attempt === 1) throw e;
      }
    }
  }

  /** Home (refreshed) -> Recent Activity "Me" scope (the default is "All") -> newest row. */
  async openFromHome(opponent: string): Promise<void> {
    await this.refreshTab("Home");
    // "View all" only renders in the Me scope with matches: proof the scope switched.
    const viewAll: Query = { label: /^view all$/i, type: "Button" };
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.idb.tap(await this.scrollToAny({ label: "Me", type: "Button" }));
      try {
        await this.idb.waitFor(viewAll, 5_000);
        break;
      } catch (e) {
        if (!(e instanceof ExpectationTimeout) || attempt === 1) throw e;
      }
    }
    await this.tapFirstRow(opponent);
  }

  /** Profile (refreshed) -> Recent Matches -> newest row. */
  async openFromProfile(opponent: string): Promise<void> {
    await this.refreshTab("Profile");
    await this.tapFirstRow(opponent);
  }

  /** Profile -> "View Detailed Stats" -> full history -> newest row. */
  async openFromStats(opponent: string): Promise<void> {
    await this.openTab("Profile");
    const btn = await this.scrollToAny({ label: /^view detailed stats$/i, type: "Button" });
    await this.idb.tap(btn);
    await this.idb.waitFor({ label: "Go back", type: "Button" }, 10_000);
    await this.tapFirstRow(opponent);
  }

  /**
   * Independent of the other entry points: Stats history -> detail (loaded)
   * -> opponent row -> athlete page -> newest head-to-head row.
   */
  async openFromAthlete(opponent: string): Promise<void> {
    await this.openFromStats(opponent);
    await pollUntil("match detail marker", async () => (this.detailMarker(await this.idb.describe()) ? true : undefined), {
      timeoutMs: 15_000,
    });
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

  /**
   * Scroll the Watch button into the hittable band before tapping: the
   * second card sits below the fold, and idb lists off-screen scroll content,
   * so a tap on its raw frame lands nowhere. Then wait for the player marker
   * (proof the tap pushed the player), retrying the tap once.
   */
  async tapWatch(videoId: string, label: string): Promise<void> {
    const els = await this.idb.describe();
    const q: Query = this.find(els, { id: watchButtonId(videoId) }) ? { id: watchButtonId(videoId) } : { label, type: "Button" };
    const marker: Query = { label: PLAYER_LABEL_RE };
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.idb.tap(await this.scrollToAny(q));
      try {
        await this.idb.waitFor(marker, 8_000);
        return;
      } catch (e) {
        if (!(e instanceof ExpectationTimeout) || attempt === 1) throw e;
      }
    }
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
