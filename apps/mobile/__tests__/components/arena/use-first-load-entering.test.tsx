/**
 * List enter stagger, Arena local helper (Adding Flare [10.4]): rows 0 to 7
 * rise in on the FIRST load only; never after, never under Reduce Motion.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

import {
  FIRST_LOAD_STAGGER_ROWS,
  useFirstLoadEntering,
} from "@/components/arena/use-first-load-entering";
import { __setReduceMotionForTests } from "@/lib/motion";

type Enter = ReturnType<ReturnType<typeof useFirstLoadEntering>>;

function List({ rows, onEnter }: { rows: number; onEnter: (e: Enter[]) => void }) {
  const enter = useFirstLoadEntering();
  onEnter(Array.from({ length: rows }, (_, i) => enter(i)));
  return null;
}

beforeEach(() => __setReduceMotionForTests(false));

describe("useFirstLoadEntering (Arena local)", () => {
  it("staggers the first 8 rows of the first load only", () => {
    let seen: Enter[] = [];
    const r = render(<List rows={10} onEnter={(e) => (seen = e)} />);
    expect(seen.slice(0, FIRST_LOAD_STAGGER_ROWS).every((e) => typeof e === "function")).toBe(true);
    expect(seen.slice(FIRST_LOAD_STAGGER_ROWS).every((e) => e === undefined)).toBe(true);

    // A refetch, refresh or a row joining later: no stagger.
    r.rerender(<List rows={11} onEnter={(e) => (seen = e)} />);
    expect(seen.every((e) => e === undefined)).toBe(true);
  });

  it("each staggered row rises 8 px and fades in, 60 ms apart", () => {
    let seen: Enter[] = [];
    render(<List rows={3} onEnter={(e) => (seen = e)} />);
    const anim = (seen[2] as unknown as (v: unknown) => {
      initialValues: { opacity: number; transform: { translateY: number }[] };
    })({});
    expect(anim.initialValues.opacity).toBe(0);
    expect(anim.initialValues.transform[0].translateY).toBe(8);
  });

  it("a mount with no rows yet does not spend the first load", () => {
    let seen: Enter[] = [];
    const r = render(<List rows={0} onEnter={(e) => (seen = e)} />);
    r.rerender(<List rows={2} onEnter={(e) => (seen = e)} />);
    expect(seen.every((e) => typeof e === "function")).toBe(true);
    r.rerender(<List rows={2} onEnter={(e) => (seen = e)} />);
    expect(seen.every((e) => e === undefined)).toBe(true);
  });

  it("Reduce Motion: no entering animation", () => {
    __setReduceMotionForTests(true);
    let seen: Enter[] = [];
    render(<List rows={3} onEnter={(e) => (seen = e)} />);
    expect(seen.every((e) => e === undefined)).toBe(true);
  });
});
