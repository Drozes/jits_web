/**
 * WP2 guard (jits-3eeg.3; R3 CO-1, CO-2, CO-6, CO-7, ST-1, ST-2, MF-5, PR-1,
 * PR-2, RK-1, SC-6, FR-1, FR-2): color semantics. Grep-style, so the sweep
 * cannot quietly come back:
 *
 * - Signal Red only for CTA fills, the "act / leader" rules and negatives:
 *   every file that still draws red is listed below with its line count and
 *   the reason. A new red line anywhere (red on data, a red spinner, a red
 *   icon, a red selection) fails until it is reviewed and listed.
 * - Gain Green only for rating gains, wins and LIVE: same allowlist shape.
 * - No red spinner or refresh tint, no red or green selected / done state,
 *   no red selection tint in the palette, one neutral Switch track.
 *
 * DESIGN.md "Color" (Usage rules) and "Open decisions" 9, 12 and 14 are the
 * rules; `components/ui/elo-system/selection.tsx` is the one selected state.
 */
import * as fs from "fs";
import * as path from "path";
import { darkTokens, lightTokens } from "@/lib/tokens";
import { paletteFor } from "@/lib/theme/palette";
import { switchColors } from "@/components/ui/switch";

const ROOT = path.resolve(__dirname, "../../..");
const SCAN = ["app", "components", "lib"];

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ file: path.relative(ROOT, p), text: fs.readFileSync(p, "utf8") });
      }
    }
  };
  for (const d of SCAN) walk(path.join(ROOT, d));
  return out;
}

/** Every opening tag `<Name ...>` (brace-aware, so arrow functions in props do not end it). */
function openingTags(text: string, name: string): string[] {
  const tags: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 0;
    let k = m.index + m[0].length;
    for (; k < text.length; k++) {
      const c = text[k];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && c === ">") break;
    }
    tags.push(text.slice(m.index, k + 1));
  }
  return tags;
}

const FILES = sources();

/**
 * Red: the classes and JS tokens that draw Signal Red (fill, rule or red text),
 * the negative family (`negative`, `stateNegative`, `p.loss`, the same hue) and
 * the legacy shadcn red (`primary`, `destructive`; WP4 retires them).
 */
const RED =
  /(?<![-\w])(bg|border|border-[lrtb]|text)-(cta|negative)\b|\baccentCta(Text)?\b|\bstateNegative\b|\bp\.(cta|red|ctaPressed|loss)\b|\bON_MEDIA\.(cta|red|redRule|inkRed)\b|\bBROADCAST\.(cta|ctaHover|ctaText)\b|(?<![-\w])(bg|border|text)-(primary|destructive)\b|\btokens\.(primary|destructive)\b/;

/** Green: the classes and JS tokens that draw Gain Green, plus the legacy shadcn `success`. */
const GREEN =
  /(?<![-\w])(bg|border|border-[lrtb]|text)-(positive|success)\b|\bstatePositive\b|\bp\.win(Rule)?\b|\bON_MEDIA\.win\b|\bonMediaTokens\.win\b|\btokens\.success\b/;

type Allow = Record<string, { lines: number; reason: string }>;

/** Files that may draw Signal Red, with their matching-line count and why. */
const RED_ALLOWED: Allow = {
  "app/(app)/(tabs)/profile/stats.tsx": { lines: 1, reason: "the losses count (a negative)" },
  "app/(app)/settings/feedback.tsx": { lines: 1, reason: "the over-limit character count (an error)" },
  "app/(auth)/invite-code.tsx": { lines: 2, reason: "the throttled and invalid-code errors (negatives)" },
  "app/(auth)/login.tsx": { lines: 1, reason: "the Register text link (an act)" },
  "app/(auth)/signup.tsx": { lines: 1, reason: "the Sign in text link (an act)" },
  "app/invite-setup.tsx": { lines: 2, reason: "the underage and claim errors (negatives)" },
  "app/profile-setup.tsx": { lines: 1, reason: "the load error (a negative)" },
  "components/admin/member-gym-owner-section.tsx": { lines: 1, reason: "REMOVE gym ownership, a destructive action (confirmed by a destructive alert)" },
  "components/arena/afterglow-edge.tsx": { lines: 1, reason: "the challenge afterglow edge (heat)" },
  "components/arena/challenge-prompt-sheet.tsx": { lines: 2, reason: "Accept CTA fill and the Adding Flare accept sweep" },
  "components/arena/competitor-row.tsx": { lines: 2, reason: "the Challenge outline action (an act; WP3 Button domain)" },
  "components/arena/go-live-plate.tsx": { lines: 1, reason: "Go live CTA fill" },
  "components/arena/mat-board.tsx": { lines: 2, reason: "Mat Board CTA fills (Challenge, Go live)" },
  "components/arena/strip-primitives.tsx": { lines: 1, reason: "the red StripShell rail (an act)" },
  "components/athlete/head-to-head-card.tsx": { lines: 1, reason: "the head-to-head losses count (a negative)" },
  "components/auth/auth-form-field.tsx": { lines: 2, reason: "the error edge and error text (focus is ink-2 since WP2)" },
  "components/error-boundary.tsx": { lines: 1, reason: "the error message (a negative)" },
  "components/highlight-viewer/reel-rail-button.tsx": { lines: 1, reason: "the reel viewer rail Share CTA fill (the page's one Signal Red CTA, own reels only)" },
  "components/film-room/film-room-states.tsx": { lines: 1, reason: "the state panel's text action" },
  "components/film-room/opening-still.tsx": { lines: 1, reason: "the red VS (brand chrome, Open decision 12)" },
  "components/film-room/poster-card.tsx": { lines: 4, reason: "the L outcome (a loss)" },
  "components/matches/match-feed-meta.tsx": { lines: 1, reason: "the Matches feed card's L letter and negative delta (a loss; spec 6.2)" },
  "components/film-room/status-badge.tsx": { lines: 1, reason: "the failed status (a negative)" },
  "components/invite/claim-dob-step.tsx": { lines: 1, reason: "the date-of-birth error (a negative)" },
  "components/layout/arena-tab-icon.tsx": { lines: 2, reason: "the live ember, blade clash spark and the registered Swords icon" },
  "components/layout/elo-tab-bar.tsx": { lines: 1, reason: "the active tab edge" },
  "components/layout/header-status-chip.tsx": { lines: 1, reason: "the incoming-challenge edge (an act)" },
  "components/leaderboard/rank-flare.tsx": { lines: 1, reason: "the registered rank flare" },
  "components/match-card.tsx": { lines: 1, reason: "a negative rating delta" },
  "components/match-detail/ai-breakdown.tsx": { lines: 1, reason: "the TRY AGAIN text action after an error" },
  // toneColor moved here from match-detail/film-angles.tsx (jits-n2im.25): the deck's "act" class,
  // red only on the viewer's own retryable upload (COPY-DECK 0.6).
  "components/video-status/film-status-bits.tsx": { lines: 1, reason: "the act class: my own retryable upload (a negative)" },
  "components/match-detail/match-detail-states.tsx": { lines: 1, reason: "the Retry / Back text action" },
  "components/match-detail/match-verdict.tsx": { lines: 1, reason: "a negative rating delta" },
  "components/match-detail/video-state-panel.tsx": { lines: 2, reason: "the failed / missing state (a negative) and the Try again / Back text action" },
  "components/match-flow/camera-overlay.tsx": { lines: 1, reason: "the REC dot over the camera" },
  "components/match-flow/countdown/countdown.tsx": { lines: 5, reason: "the countdown drain bar, GO slam and the REC tag (registered, Adding Flare)" },
  "components/match-flow/faceoff/faceoff-top.tsx": { lines: 5, reason: "the red VS, your-side accent and you-mark dot (brand chrome next to the VS, Open decision 12) and the invalid weight edge (a negative)" },
  "components/match-flow/faceoff/faceoff-weight-check.tsx": { lines: 1, reason: "the invalid weight edge" },
  "components/match-flow/fight/fight-ui.tsx": { lines: 1, reason: "a negative rating delta" },
  "components/match-flow/live/athlete-bar.tsx": { lines: 3, reason: "the broadcast VS, its rule and the you-mark beside it (brand chrome next to the VS, Open decision 12)" },
  "components/match-flow/live/hold-to-end-button.tsx": { lines: 2, reason: "End match CTA fill and its hold fill" },
  "components/match-flow/live/rec-tally.tsx": { lines: 1, reason: "the ON AIR tally (Adding Flare)" },
  "components/match-flow/match-flow-wizard.tsx": { lines: 1, reason: "step progress segments, brand chrome (Open decision 12)" },
  "components/match-flow/steps/confirm-step-panels.tsx": { lines: 1, reason: "YOU LOST (a loss)" },
  "components/match-flow/steps/result-form.tsx": { lines: 3, reason: "the Change text action, and the invalid finish-time edge and its WITHIN error (negatives)" },
  "components/match-flow/steps/submission-fields.tsx": { lines: 2, reason: "the invalid finish-time edge and its error" },
  "components/match-flow/upload-progress-banner.tsx": { lines: 6, reason: "the upload failed / truncated warnings (negatives)" },
  "components/match-flow/verdict/rating-moment.tsx": { lines: 1, reason: "the tap marks (Adding Flare)" },
  "components/profile-setup/date-of-birth-picker.tsx": { lines: 1, reason: "the picker's Done text action" },
  "components/profile-setup/elo-form-field.tsx": { lines: 2, reason: "the error edge and error text (focus is ink-2 since WP2)" },
  "components/profile-setup/setup-wizard.tsx": { lines: 1, reason: "the save error (a negative)" },
  "components/profile-setup/wizard-progress.tsx": { lines: 1, reason: "step progress segments, brand chrome (Open decision 12)" },
  "components/profile/account-section.tsx": { lines: 1, reason: "the destructive row (Delete account)" },
  "components/profile/elo-progression.tsx": { lines: 1, reason: "a negative rating delta" },
  "components/profile/profile-quick-stats.tsx": { lines: 1, reason: "the losses count (a negative)" },
  "components/profile/submission-breakdown.tsx": { lines: 2, reason: "the load error and submission loss counts (the bars are ink-2)" },
  "components/share-profile-sheet.tsx": { lines: 1, reason: "the losses count (a negative)" },
  "components/ui/badge.tsx": { lines: 2, reason: "the destructive variant (a negative)" },
  "components/ui/count-pill.tsx": { lines: 1, reason: "CountPill (a count of things to act on)" },
  "components/ui/elo-system/button.tsx": { lines: 6, reason: "the primary Button fill and its pressed lift, and the destructive outline in negative" },
  "components/ui/elo-system/delta-number.tsx": { lines: 1, reason: "a negative rating delta" },
  "components/ui/elo-system/elo-tile.tsx": { lines: 3, reason: "the EloTile bar and accent edge, and the negative (loss) tone" },
  "components/ui/elo-system/er-mark.tsx": { lines: 1, reason: "the E\u00b7R lettermark" },
  "components/ui/elo-system/outcome-tag.tsx": { lines: 2, reason: "the L outcome" },
  "components/ui/elo-system/plate.tsx": { lines: 2, reason: "the Plate accent rail and the loss rail" },
  "components/ui/elo-system/rank-row.tsx": { lines: 1, reason: "the leader rule (the #1 numeral is ink)" },
  "components/ui/elo-system/splash-glow-statement.tsx": { lines: 1, reason: "ARE YOU? in the launch splash (brand moment)" },
  "components/ui/elo-system/splash-reveal.tsx": { lines: 1, reason: "the launch splash (brand moment)" },
  "components/ui/elo-system/splash-statement.tsx": { lines: 1, reason: "ARE YOU? in the launch splash (brand moment)" },
  "components/ui/search-select.tsx": { lines: 1, reason: "the picker's Done text action" },
  "components/ui/skeleton/skeleton.tsx": { lines: 1, reason: "the skeleton twin of the Plate accent rail" },
  "components/ui/toast.tsx": { lines: 1, reason: "the error toast rail" },
  "lib/error-tracking/sentry.ts": { lines: 1, reason: "the feedback form's submit button fill" },
  "lib/notifications/register-push.ts": { lines: 1, reason: "the Android notification light" },
  "lib/theme/palette.ts": { lines: 3, reason: "the match-flow mirror (cta, red, loss)" },
  "lib/theme/theme-provider.tsx": { lines: 3, reason: "writes --accent-cta / --accent-cta-text / --state-negative" },
  "lib/tokens.ts": { lines: 10, reason: "the token definitions" },
};

/** Files that may draw Gain Green (gains, wins, LIVE), with their matching-line count and why. */
const GREEN_ALLOWED: Allow = {
  "components/arena/mat-board.tsx": { lines: 3, reason: "the live Mat Board rows and the live toggle state" },
  "components/arena/on-air-strip.tsx": { lines: 4, reason: "the ON AIR strip (Adding Flare)" },
  "components/athlete/head-to-head-card.tsx": { lines: 1, reason: "the head-to-head wins count" },
  "components/film-room/poster-card.tsx": { lines: 4, reason: "the W outcome" },
  "components/matches/match-feed-meta.tsx": { lines: 1, reason: "the Matches feed card's W letter and positive delta (a win, a gain; spec 6.2)" },
  "components/layout/elo-tab-bar.tsx": { lines: 1, reason: "the live dot on the Arena tab" },
  "components/layout/header-live-dot.tsx": { lines: 1, reason: "the header live dot" },
  "components/layout/header-status-chip.tsx": { lines: 3, reason: "the live header status chip" },
  "components/match-card.tsx": { lines: 1, reason: "a positive rating delta" },
  "components/match-detail/match-verdict.tsx": { lines: 1, reason: "a positive rating delta" },
  "components/match-flow/fight/fight-ui.tsx": { lines: 1, reason: "a positive rating delta (the done StatusPlate is ink)" },
  "components/match-flow/steps/confirm-step-panels.tsx": { lines: 1, reason: "YOU WON (a win; the confirmed panel is ink)" },
  "components/match-flow/verdict/verdict-step.tsx": { lines: 2, reason: "the rank strip, shown only on a win (a rank gain)" },
  "components/profile/elo-progression.tsx": { lines: 1, reason: "a positive rating delta" },
  "components/profile/profile-quick-stats.tsx": { lines: 1, reason: "the wins count" },
  "components/profile/submission-breakdown.tsx": { lines: 1, reason: "submission win counts (the bars are ink-2)" },
  "components/ui/badge.tsx": { lines: 2, reason: "success: gains and wins only" },
  "components/ui/elo-system/delta-number.tsx": { lines: 1, reason: "a positive rating delta" },
  "components/ui/elo-system/elo-tile.tsx": { lines: 1, reason: "the EloTile positive tone (a gain)" },
  "components/ui/elo-system/live-pill.tsx": { lines: 4, reason: "LivePill / LiveDot" },
  "components/ui/elo-system/outcome-tag.tsx": { lines: 2, reason: "the W outcome" },
  "components/ui/elo-system/participant-row.tsx": { lines: 2, reason: "Available (an athlete who is live)" },
  "components/ui/elo-system/plate.tsx": { lines: 2, reason: "the win and live Plate rails" },
  "components/ui/skeleton/skeleton.tsx": { lines: 1, reason: "the skeleton twin of the live Plate rail" },
  "lib/theme/palette.ts": { lines: 1, reason: "the match-flow mirror (win)" },
  "lib/theme/theme-provider.tsx": { lines: 1, reason: "writes --state-positive" },
  "lib/tokens.ts": { lines: 3, reason: "the token definitions" },
};

function linesMatching(text: string, re: RegExp): number {
  return text.split("\n").filter((l) => re.test(l)).length;
}

function checkAllowlist(re: RegExp, allowed: Allow): string[] {
  const offenders: string[] = [];
  for (const f of FILES) {
    const n = linesMatching(f.text, re);
    const a = allowed[f.file];
    if (n === 0 && !a) continue;
    if (!a) offenders.push(`${f.file}: ${n} line(s), not on the allowlist`);
    else if (n !== a.lines) offenders.push(`${f.file}: ${n} line(s), the allowlist says ${a.lines}`);
  }
  for (const [file, { reason }] of Object.entries(allowed)) {
    if (!fs.existsSync(path.join(ROOT, file))) offenders.push(`${file}: allowlisted but missing`);
    if (reason.trim().length === 0) offenders.push(`${file}: no reason`);
  }
  return offenders;
}

describe("color semantics (WP2)", () => {
  it("Signal Red appears only on the reviewed CTA, rule, negative and brand-chrome lines", () => {
    expect(checkAllowlist(RED, RED_ALLOWED)).toEqual([]);
  });

  it("Gain Green appears only on gains, wins and LIVE", () => {
    expect(checkAllowlist(GREEN, GREEN_ALLOWED)).toEqual([]);
  });

  it("no spinner or pull-to-refresh is tinted red or green (R3 CO-6)", () => {
    const tint = new RegExp(`${RED.source}|${GREEN.source}|\\btokens\\.primary\\b`);
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const name of ["ActivityIndicator", "RefreshControl"]) {
        for (const tag of openingTags(f.text, name)) {
          if (tint.test(tag)) offenders.push(`${f.file}: <${name}>`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no data bar is filled red (R3 CO-1, PR-1, PR-2)", () => {
    for (const file of ["components/profile/submission-breakdown.tsx", "components/profile/weekly-activity.tsx"]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(text).not.toMatch(/\bbg-cta\b/);
      expect(text).toMatch(/\bbg-ink-2\b/);
    }
  });

  it("no selected, active or checked state resolves to red (R3 ST-2, MF-5, D-7)", () => {
    // `isActive ? "border-cta"` (the active tab edge) is deliberately not
    // matched: `\b` does not split `isActive`.
    const sel =
      /\b(active|selected|agreed|checked|waiverAccepted)\s*\?\s*(["'`][^"'`]*(?<![-\w])(bg|border|text)-(cta|negative|primary|destructive)\b|p\.(cta|red|loss)\b|p\.selectedBg|tokens\.(accentCta|stateNegative|primary|destructive)\b)/;
    const offenders = FILES.filter((f) => sel.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("no ready, confirmed, done, uploaded or recording state resolves to green (R3 CO-2)", () => {
    const done =
      /\b(ready|confirmed|done|uploaded|recording|opponentRecording|f\.opponentRecording)\s*\?\s*(["'`][^"'`]*-(positive|success)\b|p\.win(Rule)?\b|tokens\.(statePositive|success)\b)/;
    const offenders = FILES.filter((f) => done.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("the palette carries no red selection tint", () => {
    for (const scheme of ["dark", "light"] as const) {
      expect(paletteFor(scheme)).not.toHaveProperty("selectedBg");
    }
  });

  it("the Switch track is neutral in both themes (R3 ST-1)", () => {
    for (const t of [darkTokens, lightTokens]) {
      const c = switchColors(t);
      expect(c.trackColor).toEqual({ false: t.textTertiary, true: t.textPrimary });
      expect(c.thumbColor).toBe(t.bgPrimary);
      expect(c.ios_backgroundColor).toBe(t.textTertiary);
      for (const forbidden of [t.accentCta, t.accentCtaText, t.statePositive]) {
        expect([c.trackColor?.true, c.trackColor?.false, c.thumbColor]).not.toContain(forbidden);
      }
    }
  });

  it("reel tiles draw no Signal Red and no gain or loss colour; the unseen ring is the unseen-ring token (AC 3.5)", () => {
    const reels = FILES.filter((f) => f.file.startsWith("components/reels/"));
    expect(reels.length).toBeGreaterThan(0);
    const offenders = reels.filter((f) => RED.test(f.text) || GREEN.test(f.text)).map((f) => f.file);
    expect(offenders).toEqual([]);
    // Neither the amber attention ink nor a heat colour stands in for the ring.
    const frame = reels.find((f) => f.file === "components/reels/reel-tile-frame.tsx");
    expect(frame?.text).toMatch(/ring \? "border-unseen-ring"/);
    expect(reels.some((f) => /\bunseenRing\b|border-unseen-ring/.test(f.text) && f.file !== "components/reels/reel-tile-frame.tsx")).toBe(false);
    for (const t of [darkTokens, lightTokens]) {
      expect(t.unseenRing).toBe(t.textPrimary);
      expect(t.unseenRing).not.toBe(t.accentCta);
      expect(t.unseenRing).not.toBe(t.accentCtaText);
    }
  });

  it("every switch takes its colors from the one switch look", () => {
    const offenders = FILES.filter(
      (f) => /\b(trackColor|thumbColor)\s*=/.test(f.text) && f.file !== "components/ui/switch.tsx",
    ).map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});
