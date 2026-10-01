import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StartBlock } from "@/hooks/use-arena-challenge";
import { IncomingChallengePlate } from "./incoming-challenge-plate";

function renderBlocked(startBlocked: StartBlock) {
  render(
    <IncomingChallengePlate
      name="Ana"
      onAccept={vi.fn()}
      onDecline={vi.fn()}
      disabled={false}
      startBlocked={startBlocked}
    />,
  );
}

describe("IncomingChallengePlate blocked start copy", () => {
  it.each<[StartBlock, string]>([
    ["self_location", "Can't confirm your location. Try again."],
    ["peer_location", "Waiting for Ana's location."],
    ["proximity", "You need to be on the same mat as Ana to start."],
    ["implausible", "Can't pin your location. Try again."],
    ["accuracy", "Can't pin your location. Try near a window."],
  ])("%s says: %s", (block, copy) => {
    renderBlocked(block);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
