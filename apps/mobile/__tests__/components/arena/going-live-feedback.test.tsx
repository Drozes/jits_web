/**
 * Live location fixes 4.2: from the Go Live tap until the flow resolves the
 * Arena bar's LIVE segment pulses (busy), and only for a go-live, never for
 * a go-offline in flight. The header chip's half is in
 * header-status-chip.test.tsx. With Reduce Motion on the pulse is still.
 *
 * Source: apps/mobile/components/arena/mat-board.tsx (MatControlBar),
 * apps/mobile/components/ui/elo-system/live-pill.tsx (PendingDot)
 */
import * as React from "react";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
import { act, render } from "@testing-library/react-native";
import { MatControlBar } from "@/components/arena/mat-board";
import { PendingDot } from "@/components/ui/elo-system/live-pill";
import { __setReduceMotionForTests } from "@/lib/match-flow/use-reduce-motion";

function bar(p: { isLive: boolean; saving: boolean; goingLive?: boolean }) {
  return render(
    <MatControlBar
      isLive={p.isLive}
      locked={false}
      saving={p.saving}
      goingLive={p.goingLive}
      // A live choice on its way (round 3: the screen derives it from the intent).
      pending={p.saving && p.goingLive === true && !p.isLive}
      counts="3 ON MAT"
      onGoLive={jest.fn()}
      onGoOffline={jest.fn()}
    />,
  );
}

describe("MatControlBar going-live pulse", () => {
  it("pulses the LIVE segment while a go-live is in flight, announced busy", () => {
    const s = bar({ isLive: false, saving: true, goingLive: true });
    expect(s.getByTestId("arena-segment-live-pending", { includeHiddenElements: true })).toBeTruthy();
    expect(s.getByTestId("arena-segment-live").props.accessibilityState).toMatchObject({ busy: true });
    // QA 4: OFFLINE is not drawn selected meanwhile, and stays tappable.
    expect(s.getByTestId("arena-segment-offline").props.accessibilityState).toMatchObject({
      selected: false,
      disabled: false,
    });
  });

  it("no pulse at rest", () => {
    expect(bar({ isLive: false, saving: false }).queryByTestId("arena-segment-live-pending", { includeHiddenElements: true })).toBeNull();
  });

  it("no pulse while going OFFLINE (saving, but not a go-live)", () => {
    // The offline write commits isLive false before the flag write lands.
    expect(bar({ isLive: false, saving: true, goingLive: false }).queryByTestId("arena-segment-live-pending", { includeHiddenElements: true })).toBeNull();
  });

  it("no pulse once live", () => {
    expect(bar({ isLive: true, saving: true, goingLive: true }).queryByTestId("arena-segment-live-pending", { includeHiddenElements: true })).toBeNull();
  });
});

describe("PendingDot", () => {
  afterEach(() => {
    act(() => __setReduceMotionForTests(false));
  });

  it("is decorative (hidden from assistive tech)", () => {
    const s = render(<PendingDot testID="dot" />);
    expect(s.getByTestId("dot", { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it("renders still under Reduce Motion", () => {
    act(() => __setReduceMotionForTests(true));
    const s = render(<PendingDot testID="dot" />);
    const style = [s.getByTestId("dot", { includeHiddenElements: true }).props.style].flat(3) as Record<string, unknown>[];
    const merged = Object.assign({}, ...style.filter(Boolean));
    expect(merged.opacity ?? 1).toBe(1);
  });
});
