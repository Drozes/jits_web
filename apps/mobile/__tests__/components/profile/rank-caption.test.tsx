/**
 * The "#N · Global" rank caption on My Profile and on a viewed competitor is
 * data, not a CTA: the number is default ink mono tabular-nums, the suffix is
 * ink-3, and nothing in it is Signal Red (jits-4zp.8).
 *
 * Sources: apps/mobile/components/profile/profile-header.tsx,
 *          apps/mobile/components/athlete/competitor-header.tsx
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});

jest.mock("@/lib/env", () => ({ env: { supabaseUrl: "https://example.supabase.co" } }));

import { ProfileHeader } from "@/components/profile/profile-header";
import { CompetitorHeader } from "@/components/athlete/competitor-header";
import type { Athlete } from "@jits/shared/types/athlete";

const athlete = {
  display_name: "Demo Blue",
  current_elo: 1016,
  highest_elo: 1016,
  current_weight: 170,
  profile_photo_url: null,
  gender: "male",
};

function expectInkCaption(caption: { props: { className: string; children: unknown } }) {
  expect(caption).toHaveTextContent("#1  ·  Global");
  expect(caption.props.className).toContain("text-ink");
  expect(caption.props.className).toContain("font-mono-bold");
  expect(caption.props.className).toContain("tabular-nums");
  expect(caption.props.className).not.toContain("text-cta");
  expect(caption.props.className).not.toContain("text-negative");
}

describe("rank caption colour", () => {
  it("renders the Profile rank in ink with an ink-3 suffix", () => {
    const { getByTestId, getByText } = render(
      <ProfileHeader athlete={athlete} gymName={null} rank={1} />,
    );
    expectInkCaption(getByTestId("profile-rank") as never);
    expect(getByText("  ·  Global").props.className).toContain("text-ink-3");
  });

  it("renders the competitor rank in ink with an ink-3 suffix", () => {
    const { getByTestId, getByText } = render(
      <CompetitorHeader
        athlete={{ ...athlete, id: "opp-1" } as unknown as Athlete}
        gymName={null}
        stats={{ wins: 3, losses: 1, draws: 0, winRate: 75 } as never}
        rank={1}
      />,
    );
    expectInkCaption(getByTestId("competitor-rank") as never);
    expect(getByText("  ·  Global").props.className).toContain("text-ink-3");
  });

  it("omits the caption without a rank", () => {
    const { queryByTestId } = render(<ProfileHeader athlete={athlete} gymName={null} />);
    expect(queryByTestId("profile-rank")).toBeNull();
  });
});
