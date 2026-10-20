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
 *   - history rows labelled "Open match vs <name>" (Pressables), and the
 *     Film tab's cards `film-card-<matchId>` (the Matches tab, labelled
 *     Film since 2026-10-09, route still `matches`; it replaced the Film
 *     Room and Profile's Recent Matches and Film Room preview, spec
 *     specs/matches-tab/spec.md); its accessibility-only header title
 *     (a Heading "Film", testID `tab-header-title-film`) proves the tab
 *     root is showing (the result chips are hidden on a zero-match account).
 * Selectors take the testID OR the label, never a container testID.
 */
import type { AXElement, Idb, Query } from "./idb";
import { matches, summarise } from "./idb";
import { TAB_LABELS, type Screens } from "./screens";
import { ExpectationTimeout, pollUntil } from "../lib/util";

export const DETAIL_MARKER_ID = "match-detail-screen";
export const PLAYER_STATE_ID = "video-player-state";
const DETAIL_LABEL_RE = /^Match detail vs (.+)$/i;
const PLAYER_LABEL_RE = /^Video state: (\w+)$/i;
export type ProvenTab = "Home" | "Film" | "Profile";
/** Elements only that tab's root renders (any one is proof). */
export const TAB_PROOF: Record<ProvenTab, Query[]> = {
  Home: [{ label: "Me", type: "Button" }],
  // BrandHeader's accessibility-only tab heading (never drawn since
  // jits-1ez5, still in the accessibility tree): present in every Film state
  // (zero, low data, loading, error), unlike the result chips, which a
  // zero-match account hides. idb reports it as a Heading labelled "Film"
  // and, being a Text, usually without its testID, so the label counts too
  // (the tab bar's own "Film" is a Button, never a Heading). Case-sensitive:
  // match detail's FilmAngles header is also a Heading, reading "FILM" with
  // one usable angle (components/match-detail/film-angles.tsx), and string
  // labels match case-insensitively.
  Film: [{ id: "tab-header-title-film" }, { label: /^Film$/, type: "Heading" }],
  Profile: [{ label: /^(share profile|view detailed stats)$/i, type: "Button" }],
};

/**
 * The header bar (BrandHeader on a tab root, AppHeader on a pushed screen)
 * is 56pt tall under the top safe area, with its controls centred in it, so
 * its bottom edge is a control's centre plus half the bar. A row whose
 * centre sits under the bar is NOT hittable: a tap there lands on the
 * header (E17, 2026-10-20: a Stats row scrolled to y=117 under the pushed
 * header, whose bar ends at 118 on the iPhone 17 Pro, and the tap opened
 * nothing).
 */
const HEADER_HALF_BAR = 28;
/** Safe area (62pt) plus the bar (56pt) on the iPhone 17 Pro: used when no header control is reported. */
const HEADER_FALLBACK_BOTTOM = 118;
/** Keep a tap target's centre at least this far inside the band. */
const BAND_MARGIN = 12;
/** The header's controls, on tab roots and pushed screens. */
const HEADER_CONTROLS: Query[] = [
  { id: "header-elo" },
  { id: "header-status-chip" },
  { id: "header-live-dot" },
  { label: "Go back", type: "Button" },
  { label: "Notifications", type: "Button" },
];

/** Bottom edge of the header bar, from its controls (pure, for tests). */
export function headerBottom(els: AXElement[], screenH: number): number {
  const controls = els.filter(
    (e) => HEADER_CONTROLS.some((q) => matches(e, q)) && e.frame.width > 0 && e.frame.y + e.frame.height / 2 < screenH * 0.25,
  );
  if (controls.length === 0) return HEADER_FALLBACK_BOTTOM;
  return Math.max(...controls.map((c) => c.frame.y + c.frame.height / 2 + HEADER_HALF_BAR));
}

/**
 * Top of the tab bar, or the screen bottom on a pushed screen (pure, for
 * tests). A row whose centre sits under the tab bar is NOT hittable: a tap
 * there lands on a tab (E17's first live run tapped "Rankings" instead of a
 * Profile row).
 */
export function tabBarTop(els: AXElement[], screenH: number): number {
  const tabs = els.filter(
    (e) => (TAB_LABELS as readonly string[]).includes(e.AXLabel ?? "") && e.type !== "StaticText" && e.type !== "Heading" && e.frame.y > screenH * 0.75,
  );
  return tabs.length > 0 ? Math.min(...tabs.map((t) => t.frame.y)) : screenH;
}

/**
 * The band a tap target's centre must sit in: below the header bar and
 * above the tab bar, each with BAND_MARGIN to spare (pure, for tests).
 */
export function hittableBand(els: AXElement[], screenH: number): { top: number; bottom: number } {
  return { top: headerBottom(els, screenH) + BAND_MARGIN, bottom: tabBarTop(els, screenH) - BAND_MARGIN };
}

/** Swipe speed for `bandMove`: slow enough that the fling after release stays short. */
const MOVE_PT_PER_S = 300;

/**
 * The vertical swipe that moves an element centred at `cy` towards the
 * band's middle (pure, for tests): at most 80% of the band per move,
 * centred on the screen's middle (clear of the header, chips rows and the
 * tab bar), at MOVE_PT_PER_S (0.3 s at least).
 */
export function bandMove(
  cy: number,
  band: { top: number; bottom: number },
  screenH: number,
): { fromY: number; toY: number; durationS: number } {
  const target = (band.top + band.bottom) / 2;
  const span = (band.bottom - band.top) * 0.8;
  // > 0: the content must move up (finger moves up).
  const d = Math.max(-span, Math.min(span, cy - target));
  const mid = screenH / 2;
  return { fromY: mid + d / 2, toY: mid - d / 2, durationS: Math.max(0.3, Math.abs(d) / MOVE_PT_PER_S) };
}

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
   * Scroll the current screen until `q`'s centre is inside `hittableBand`
   * (below the header bar, above the tab bar) and return the settled
   * element, so every tap through here lands inside the band.
   *
   * idb lists off-screen scroll content with its real frame, so the element
   * says which way and how far to scroll: each move is aimed at the band's
   * middle (`bandMove`) and made slowly, so the fling after it stays small,
   * then re-measured. A blind fixed-direction swipe loop overshoots: on
   * 2026-10-20 a fast swipe flung E17's Stats row above the screen, and
   * further "up" swipes could never bring it back. Only an element not in
   * the tree yet (outside a virtualised list's window) is scrolled blind
   * until it appears.
   */
  async scrollToAny(q: Query, maxMoves = 8): Promise<AXElement> {
    const x = this.idb.screenW / 2;
    let seen: { centreY: number; band: { top: number; bottom: number } } | null = null;
    let blind = false;
    for (let move = 0; move <= maxMoves; move++) {
      const el = await this.idb.settled(q);
      if (!el) {
        if (blind) break;
        blind = true;
        try {
          await this.idb.scrollTo(q, 6, "up", 130);
        } catch (e) {
          if (!(e instanceof ExpectationTimeout)) throw e;
          await this.idb.scrollTo(q, 10, "down", 130);
        }
        continue;
      }
      const els = await this.idb.describe();
      const cur = els.find((e) => matches(e, q)) ?? el;
      const cy = cur.frame.y + cur.frame.height / 2;
      const band = hittableBand(els, this.idb.screenH);
      seen = { centreY: cy, band };
      if (cy > band.top && cy < band.bottom) return cur;
      if (move === maxMoves) break;
      const m = bandMove(cy, band, this.idb.screenH);
      await this.idb.swipe(x, m.fromY, x, m.toY, m.durationS);
    }
    throw new ExpectationTimeout(`UI element ${JSON.stringify(q.label ?? q.id)} in the hittable band`, maxMoves, seen);
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

  /**
   * Pop pushed screens until a tab root is showing (`Screens.backToTabRoot`:
   * a back control the detail hero scrolled away is scrolled back into
   * reach first, and a screen it cannot leave throws).
   */
  async backToTabRoot(max = 6): Promise<void> {
    await this.ui.backToTabRoot(max);
  }

  // --- entry points ------------------------------------------------------------

  /**
   * Open a tab and pull-to-refresh it. Tab refocus refetches are throttled
   * (once per 30 s, jits-5tj9.8), so a match finished seconds ago only shows
   * up in a tab's lists after an explicit refresh.
   */
  async refreshTab(tab: ProvenTab): Promise<void> {
    await this.openTab(tab);
    await this.scrollToTop();
    await this.idb.pullToRefresh();
    await new Promise((r) => setTimeout(r, 1_500));
  }

  /**
   * Tap the tab by its exact label, then prove the tab root is showing via an
   * element only that tab renders (retry the tap once).
   */
  async openTab(tab: ProvenTab): Promise<void> {
    const proof = TAB_PROOF[tab];
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.backToTabRoot();
      await this.ui.tab(tab);
      try {
        await this.idb.waitAny(proof, 8_000);
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

  /** Film tab (route `matches`) -> pull-to-refresh -> the card for `matchId`. */
  async openFromFilm(matchId: string): Promise<void> {
    await this.refreshTab("Film");
    await this.idb.tap(await this.scrollToAny({ id: `film-card-${matchId}` }));
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

  /** The app's error screen, if it is up (`appErrorIn`). */
  async appError(): Promise<string | null> {
    return appErrorIn(await this.idb.describe());
  }
}

/** The app error boundary's title (components/error-boundary.tsx). */
export const APP_ERROR_TITLE = "SOMETHING WENT WRONG";
const APP_ERROR_PROSE = /^The app hit an unexpected error/;

/**
 * The app's error screen, if it is up (pure, for tests): the error
 * boundary's message (a dev build prints `error.message` under its prose),
 * else its title; or a dev build's LogBox "Render Error" overlay's message.
 * Null when neither is on screen.
 */
export function appErrorIn(els: AXElement[]): string | null {
  const title = els.findIndex((e) => e.type === "StaticText" && e.AXLabel === APP_ERROR_TITLE);
  if (title >= 0) {
    const msg = els
      .slice(title + 1, title + 4)
      .find((e) => e.type === "StaticText" && !!e.AXLabel && !APP_ERROR_PROSE.test(e.AXLabel));
    return msg?.AXLabel ?? APP_ERROR_TITLE;
  }
  const redBox = els.findIndex((e) => e.type === "StaticText" && e.AXLabel === "Render Error");
  if (redBox >= 0) return els.slice(redBox + 1).find((e) => e.type === "StaticText" && !!e.AXLabel)?.AXLabel ?? "Render Error";
  return null;
}
