/**
 * Help & Support copy accuracy (jits-02vo.10): every claim on the screen must
 * match the app as it ships. These tests pin the claims that were false or
 * stale, and the ones that describe behavior changed in the Sept 30 review.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => children,
}));

import SettingsHelpScreen from "@/app/(app)/settings/help";

function allText(): string {
  const s = render(<SettingsHelpScreen />);
  return s
    .getAllByText(/./)
    .map((n) => {
      const c: unknown = n.props.children;
      return Array.isArray(c) ? c.join("") : String(c ?? "");
    })
    .join("\n");
}

describe("Help & Support copy", () => {
  it("keeps the four plates", () => {
    const s = render(<SettingsHelpScreen />);
    for (const title of [
      "Getting Started",
      "How ELO Works",
      "Match Footage & Privacy",
      "Report a Problem",
    ]) {
      expect(s.getByText(title)).toBeTruthy();
    }
  });

  it("no longer promises a footage download (there is no download UI)", () => {
    const text = allText();
    expect(text).not.toMatch(/download/i);
    expect(text).toMatch(/in the Film tab, where you can watch them back/);
    expect(text).not.toMatch(/Film Room/);
  });

  it("does not imply casual matches exist, and does not mention a Rematch button", () => {
    const text = allText();
    expect(text).not.toMatch(/casual/i);
    expect(text).not.toMatch(/ranked/i);
    // The only rematch wording is the Rating V9 rematch weight (spec 019
    // section 7.3), never the removed Rematch action.
    expect(text.match(/rematch/gi)).toEqual(["Rematch"]);
    expect(text).toMatch(/Rematches with the same partner count for less from the third meeting in 30 days\./);
    expect(text).toMatch(/every match counts\./);
    expect(text).toMatch(/Practice Match from Settings/);
  });

  it("says one challenge out at a time, matching the Arena lock", () => {
    expect(allText()).toMatch(/one challenge out at a time/);
    expect(allText()).not.toMatch(/up to 3 challenges/);
  });

  it("describes the face-off weight check and that a flag holds the match", () => {
    const text = allText();
    expect(text).toMatch(/straight to the face-off/);
    expect(text).toMatch(/checks the other's weight/);
    expect(text).toMatch(/can't start until that athlete re-weighs/);
    expect(text).not.toMatch(/drop straight into the match/);
  });

  it("says leaving the result counts as confirming", () => {
    expect(allText()).toMatch(
      /If you leave without disputing, it counts as confirming/,
    );
  });

  it("describes the header chip as it behaves (menu when live, GO LIVE when offline)", () => {
    const text = allText();
    expect(text).toMatch(/tap LIVE to open the Arena or go offline/);
    expect(text).toMatch(/GO LIVE/);
    expect(text).not.toMatch(/tap it to jump back to the Arena/);
    expect(text).not.toMatch(/until you go offline in the Arena\./);
  });

  it("describes Rating V9 verbatim (spec 019 section 7.3) and drops the old Elo claims", () => {
    const text = allText();
    for (const line of [
      "Everyone starts at 1500. No belt seeding. A new rating moves fast and settles as you play, and loosens again after a long break. Weight is part of the odds: the heavier athlete is expected to do better, so they win fewer points and lose more.",
      "A win is by submission only. Tap or don't. Anything else is a draw. A draw between equals changes nothing; otherwise the favourite gives up a few points to the underdog.",
      "Every win gains at least 1 point and every loss costs at least 1. Rematches with the same partner count for less from the third meeting in 30 days. Your number is your number.",
    ]) {
      expect(text).toContain(line);
    }
    expect(text).not.toMatch(/\+50/);
    expect(text).not.toMatch(/phantom/i);
    expect(text).not.toMatch(/pressure/i);
    expect(text).not.toMatch(/draws? cost/i);
    expect(text).not.toMatch(/\b1000\b/);
    expect(text).not.toMatch(/harshest/);
  });

  it("does not cite a Privacy Policy the End User Agreement does not link, or a match ID the app never shows", () => {
    const text = allText();
    expect(text).not.toMatch(/Privacy Policy/);
    expect(text).not.toMatch(/match ID/i);
  });
});
