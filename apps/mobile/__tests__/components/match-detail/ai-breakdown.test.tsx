/**
 * The match detail breakdown plate without "AI" for athletes (jits-xfvd.21,
 * jr_be spec 017 B1 and B2): non-admins read BREAKDOWN with no tier badge in
 * every phase; admins and founders (`showLabels`) keep AI BREAKDOWN and the
 * STANDARD / PREMIUM badge.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/lib/theme/use-theme", () => ({ useResolvedColorScheme: () => "dark" }));

import {
  AiBreakdown,
  BREAKDOWN_A11Y,
  BREAKDOWN_A11Y_ADMIN,
  BREAKDOWN_HEADING,
  BREAKDOWN_HEADING_ADMIN,
  BREAKDOWN_NEUTRAL,
} from "@/components/match-detail/ai-breakdown";
import type { BreakdownPhase } from "@/lib/match-detail/use-match-film";
import type { VideoAnalysis } from "@jits/shared/api/film-room";

function analysis(over: Partial<VideoAnalysis> = {}): VideoAnalysis {
  return {
    summary: "Blue hit a single leg and finished with a rear naked choke.",
    analysis_tier: "premium",
    positions: [],
    scoring_moments: [],
    technique_tags: [],
    recommendations: [],
    completed_at: null,
    match_detected: true,
    no_match_reason: null,
    ...over,
  };
}

const PHASES: [string, BreakdownPhase][] = [
  ["uploading", { kind: "uploading" }],
  ["analyzing", { kind: "analyzing", done: 2, total: 5 }],
  ["failed", { kind: "failed" }],
  ["no match", { kind: "analysis", state: "ready", analysis: analysis({ match_detected: false, no_match_reason: "An empty room." }) }],
  ["ready premium", { kind: "analysis", state: "ready", analysis: analysis({ analysis_tier: "premium" }) }],
  ["ready standard", { kind: "analysis", state: "ready", analysis: analysis({ analysis_tier: "standard" }) }],
  ["error", { kind: "analysis", state: "error", analysis: null }],
  ["loading", { kind: "analysis", state: "loading", analysis: null }],
  ["none", { kind: "analysis", state: "none", analysis: null }],
];

function plateText(utils: ReturnType<typeof render>): string {
  const plate = utils.getByTestId("ai-breakdown");
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") out.push(node);
    else if (node && typeof node === "object") {
      const n = node as { children?: unknown[] };
      n.children?.forEach(walk);
    }
  };
  walk(plate);
  return out.join(" ");
}

describe("AiBreakdown heading and tier badge", () => {
  it.each(PHASES)("non-admin, %s: BREAKDOWN, a11y Breakdown, no AI and no tier word", (_label, phase) => {
    const utils = render(<AiBreakdown phase={phase} onRetry={jest.fn()} showLabels={false} />);
    expect(utils.getByText(BREAKDOWN_HEADING)).toBeTruthy();
    expect(utils.queryByText(BREAKDOWN_HEADING_ADMIN)).toBeNull();
    expect(utils.getByTestId("ai-breakdown").props.accessibilityLabel).toBe(BREAKDOWN_A11Y);
    const text = plateText(utils);
    expect(text).toContain(BREAKDOWN_HEADING);
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toMatch(/PREMIUM|STANDARD/i);
  });

  it("non-admin ready: the neutral line, never the summary", () => {
    const utils = render(<AiBreakdown phase={PHASES[4][1]} onRetry={jest.fn()} showLabels={false} />);
    expect(utils.getByText(BREAKDOWN_NEUTRAL)).toBeTruthy();
    expect(utils.queryByText(/single leg/i)).toBeNull();
  });

  it.each([
    ["premium", "PREMIUM"],
    ["standard", "STANDARD"],
  ])("admin, ready %s: AI BREAKDOWN, a11y AI breakdown and the %s badge", (tier, badge) => {
    const phase: BreakdownPhase = { kind: "analysis", state: "ready", analysis: analysis({ analysis_tier: tier }) };
    const utils = render(<AiBreakdown phase={phase} onRetry={jest.fn()} showLabels />);
    expect(utils.getByText(BREAKDOWN_HEADING_ADMIN)).toBeTruthy();
    expect(utils.getByTestId("ai-breakdown").props.accessibilityLabel).toBe(BREAKDOWN_A11Y_ADMIN);
    expect(utils.getByText(badge)).toBeTruthy();
    expect(utils.getByText("Blue hit a single leg and finished with a rear naked choke.")).toBeTruthy();
  });

  it("admin, analyzing: AI BREAKDOWN with no badge (no tier until ready)", () => {
    const utils = render(<AiBreakdown phase={PHASES[1][1]} onRetry={jest.fn()} showLabels />);
    expect(utils.getByText(BREAKDOWN_HEADING_ADMIN)).toBeTruthy();
    expect(utils.queryByText(/PREMIUM|STANDARD/)).toBeNull();
  });
});
