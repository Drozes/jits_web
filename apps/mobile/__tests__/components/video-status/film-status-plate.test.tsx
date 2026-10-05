/**
 * The Film status plate (jits-n2im.25, boards P-VS-03 to P-VS-09): the
 * canonical surface. Same component on match detail ("Film status") and the
 * verdict ("Film"), so both read the same strings for the same fixture
 * (AC3); ready rows keep the harness Watch contract; Try again and Discard
 * are 44 px; Best angle shows on the primary (jits-n2im.15); state changes
 * are announced, ticks are not (deck 10).
 */
const mockRetry = jest.fn();
const mockDiscard = jest.fn();
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/video/use-upload-actions", () => {
  const actual = jest.requireActual("@/lib/video/use-upload-actions");
  return { ...actual, useUploadActions: () => ({ retry: mockRetry, discard: mockDiscard }) };
});

import * as React from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { FilmStatusPlate } from "@/components/video-status/film-status-plate";
import { deriveFilmStatus, type FilmStatusInput } from "@/lib/video/film-status";
import { angle, fusion, iso, MATCH_ID, ME, NOW, statusFixture, V_ME, V_OPP } from "../../support/match-video-status-fixture";

function v(over: Record<string, unknown>, opts: Partial<FilmStatusInput> = {}) {
  return deriveFilmStatus({ status: statusFixture(over), viewerId: ME, local: null, nowMs: NOW, clockOffsetMs: 0, ...opts });
}

beforeEach(() => {
  mockRetry.mockReset();
  mockDiscard.mockReset();
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("FilmStatusPlate", () => {
  it("renders the phase, line, helper and a row per angle (P-VS-07: my upload paused, theirs processing)", () => {
    const view = v(
      { angles: [angle("me", "uploading"), angle("opp", "processing")] },
      { local: { status: "paused", progress: 0.4, terminal: false, message: "No connection right now. It picks up where it left off." } },
    );
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={view} />);
    expect(s.getByText("FILM STATUS")).toBeTruthy();
    expect(s.getByText("UPLOADING")).toBeTruthy();
    expect(s.getByText("Film is coming in from 2 phones.")).toBeTruthy();
    expect(s.getByText("YOUR ANGLE")).toBeTruthy();
    expect(s.getByText("PAUSED")).toBeTruthy();
    expect(s.getByText("No connection right now. It picks up where it left off.")).toBeTruthy();
    expect(s.getByText("D. OKAFOR'S ANGLE")).toBeTruthy();
    expect(s.getByText("PROCESSING")).toBeTruthy();
  });

  it("Try again is its own 44 px control with the deck's label and calls the retry", () => {
    const view = v({ angles: [angle("me", "uploading"), angle("opp", "processing")] }, { local: { status: "error", progress: null, terminal: false, message: null } });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={view} />);
    const btn = s.getByTestId(`film-row-retry-${V_ME}`);
    expect(btn.props.accessibilityLabel).toBe("Try again: upload match video");
    expect(StyleSheet.flatten(btn.props.style)).toMatchObject({ minHeight: 44 });
    fireEvent.press(btn);
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(s.getByText("The upload didn't finish.")).toBeTruthy();
  });

  it("a terminal failure with the clip on the phone offers only Discard", () => {
    const view = v({ angles: [angle("me", "uploading"), angle("opp", "processing")] }, { local: { status: "error", progress: null, terminal: true, discardable: true, message: "This clip is too big to upload (2 GB max)." } });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={view} />);
    expect(s.queryByTestId(`film-row-retry-${V_ME}`)).toBeNull();
    fireEvent.press(s.getByTestId(`film-row-discard-${V_ME}`));
    expect(mockDiscard).toHaveBeenCalledTimes(1);
  });

  it("a ready row is the Watch control with the harness id and label, and plays", () => {
    const onWatch = jest.fn();
    const view = v({ phase: "ready", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "processing")], reels: [{ athlete_id: ME, state: "ready" }] });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={view} onWatch={onWatch} watchLabel={() => "Watch your recording"} />);
    const row = s.getByTestId(`match-video-watch-${V_ME}`);
    expect(row.props.accessibilityLabel).toBe("Watch your recording");
    expect(s.getByText("4:31")).toBeTruthy();
    fireEvent.press(row);
    expect(onWatch).toHaveBeenCalledWith(V_ME);
    // Nothing offers playback of an angle that is not ready (rule 4).
    expect(s.queryByTestId(`match-video-watch-${V_OPP}`)).toBeNull();
  });

  it("shows the Best angle tag on the primary only with 2+ ready angles (jits-n2im.15)", () => {
    const two = v({ phase: "ready", phase_reason: null, angles: [angle("me", "ready"), angle("opp", "ready", { is_primary: true })], reels: [{ athlete_id: ME, state: "ready" }] });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={two} onWatch={jest.fn()} />);
    expect(s.getByTestId(`film-row-best-${V_OPP}`)).toBeTruthy();
    expect(s.getByText("BEST ANGLE")).toBeTruthy();
    expect(s.getByTestId(`match-video-watch-${V_OPP}`).props.accessibilityLabel).toMatch(/, Best angle$/);
    expect(s.queryByTestId(`film-row-best-${V_ME}`)).toBeNull();

    const one = v({ angles: [angle("me", "ready", { is_primary: true }), angle("opp", "processing")] });
    const s2 = render(<FilmStatusPlate matchId={MATCH_ID} view={one} onWatch={jest.fn()} />);
    expect(s2.queryByText("BEST ANGLE")).toBeNull();
  });

  it("an uploading row is one progressbar element with its percent", () => {
    const view = v({ angles: [angle("me", "processing"), angle("opp", "uploading", { progress_pct: 18 })] });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={view} />);
    const el = s.getByLabelText("D. Okafor's angle, Uploading, 18 percent");
    expect(el.props.accessibilityRole).toBe("progressbar");
    expect(el.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 18 });
  });

  it("the countdown tag speaks in words", () => {
    const view = v({ phase: "waiting_for_angle", phase_reason: null, ...fusion({ dispatched_at: null, angles_used: null, angles_used_count: null }), wait_deadline_at: iso(NOW + 492_000), angles: [angle("me", "ready"), angle("opp", "uploading")] });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={view} />);
    expect(s.getByText("8:12 LEFT")).toBeTruthy();
    expect(s.getByTestId("film-status-phase-tag").props.accessibilityLabel).toBe("8 minutes 12 seconds left");
  });

  it("verdict and match detail say the same thing for the same fixture (AC3)", () => {
    const view = v({ angles: [angle("me", "processing"), angle("opp", "upload_paused")] });
    const detail = render(<FilmStatusPlate matchId={MATCH_ID} view={view} />);
    const verdict = render(<FilmStatusPlate matchId={MATCH_ID} view={view} variant="verdict" testID="verdict-film" />);
    const texts = (r: ReturnType<typeof render>) => r.UNSAFE_getAllByType(require("react-native").Text).map((t: { props: { children: unknown } }) => String(t.props.children)).filter((t: string) => t !== "FILM STATUS" && t !== "FILM");
    expect(texts(verdict)).toEqual(texts(detail));
    expect(verdict.getByText("FILM")).toBeTruthy();
  });

  it("announces a phase or row change, never on mount or a percent tick (deck 10.1)", () => {
    const spy = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const a = v({ angles: [angle("me", "processing"), angle("opp", "uploading", { progress_pct: 10 })] });
    const s = render(<FilmStatusPlate matchId={MATCH_ID} view={a} />);
    expect(spy).not.toHaveBeenCalled();
    s.rerender(<FilmStatusPlate matchId={MATCH_ID} view={v({ angles: [angle("me", "processing"), angle("opp", "uploading", { progress_pct: 60 })] })} />);
    expect(spy).not.toHaveBeenCalled();
    s.rerender(<FilmStatusPlate matchId={MATCH_ID} view={v({ phase: "building", phase_reason: null, angles: [angle("me", "processing"), angle("opp", "ready")] })} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("Building your highlight. D. Okafor's angle is ready to watch.");
    void V_OPP;
  });
});
