/**
 * useFirstLoadEntering (Adding Flare, jits-pddd.5): the list enter stagger
 * plays on the FIRST render that shows rows, for the first 8 rows only, and
 * never again on a re-render, refetch or later rows. None under Reduce Motion.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import {
  useFirstLoadEntering,
  __setReduceMotionForTests,
  type EnteringAnimation,
} from "@/lib/motion";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

type Probe = (fn: (i: number) => EnteringAnimation | undefined) => void;

function Harness({ rows, probe }: { rows: number; probe: Probe }) {
  const entering = useFirstLoadEntering();
  // Only rows ask for an animation, like a list that is still loading.
  if (rows > 0) probe(entering);
  return null;
}

function collect(rows: number) {
  const seen: Array<Array<EnteringAnimation | undefined>> = [];
  const probe: Probe = (fn) => {
    seen.push(Array.from({ length: rows }, (_, i) => fn(i)));
  };
  return { seen, probe };
}

afterEach(() => {
  act(() => __setReduceMotionForTests(false));
});

it("gives the first 8 rows an entering animation on the first load only", () => {
  const { seen, probe } = collect(10);
  const view = render(<Harness rows={10} probe={probe} />);
  const first = seen[0];
  expect(first.slice(0, 8).every((a) => a !== undefined)).toBe(true);
  expect(first[8]).toBeUndefined();
  expect(first[9]).toBeUndefined();

  // A refetch / re-render with the same rows: no replay.
  view.rerender(<Harness rows={10} probe={probe} />);
  expect(seen[1].every((a) => a === undefined)).toBe(true);
});

it("stays armed while no row has rendered (the loading state)", () => {
  const { seen, probe } = collect(3);
  const view = render(<Harness rows={0} probe={probe} />);
  view.rerender(<Harness rows={0} probe={probe} />);
  expect(seen).toHaveLength(0);
  view.rerender(<Harness rows={3} probe={probe} />);
  expect(seen[0].every((a) => a !== undefined)).toBe(true);
  view.rerender(<Harness rows={3} probe={probe} />);
  expect(seen[1].every((a) => a === undefined)).toBe(true);
});

it("staggers with a distinct animation per index", () => {
  const { seen, probe } = collect(2);
  render(<Harness rows={2} probe={probe} />);
  expect(seen[0][0]).not.toBe(seen[0][1]);
});

it("returns nothing under Reduce Motion", () => {
  act(() => __setReduceMotionForTests(true));
  const { seen, probe } = collect(4);
  render(<Harness rows={4} probe={probe} />);
  expect(seen[0].every((a) => a === undefined)).toBe(true);
});
