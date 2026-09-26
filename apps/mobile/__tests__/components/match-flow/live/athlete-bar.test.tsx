/** The athlete bar: you left with the red mark, opponent right, names uppercased. */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { AthleteBar } from "@/components/match-flow/live/athlete-bar";
import { formatAthleteMeta } from "@/lib/match-flow/live-view-state";

it("shows both athletes with meta, the You mark on the left", () => {
  const s = render(
    <AthleteBar
      me={{ name: "Kai Reyes", meta: formatAthleteMeta(1512, 77) }}
      opponent={{ name: "Mina Park", meta: formatAthleteMeta(1498, 76) }}
      flatTop={false}
    />,
  );
  expect(s.getByTestId("live-me-name")).toHaveTextContent("KAI REYES");
  expect(s.getByTestId("live-me-meta")).toHaveTextContent("1512 · 77 KG");
  expect(s.getByTestId("live-opponent-name")).toHaveTextContent("MINA PARK");
  expect(s.getByTestId("live-opponent-meta")).toHaveTextContent("1498 · 76 KG");
  expect(s.getByLabelText("You")).toBeTruthy();
  expect(s.getByTestId("live-me-name").props.numberOfLines).toBe(1);
  expect(s.getByTestId("live-me-name").props.ellipsizeMode).toBe("tail");
});

it("omits a missing meta line and shows NO RATING for the practice bot", () => {
  const s = render(
    <AthleteBar
      me={{ name: "Me", meta: formatAthleteMeta(null, null) }}
      opponent={{ name: "Practice Partner", meta: "NO RATING" }}
      flatTop
    />,
  );
  expect(s.queryByTestId("live-me-meta")).toBeNull();
  expect(s.getByTestId("live-opponent-meta")).toHaveTextContent("NO RATING");
});

it("squares its top corners when a strip sits on it", () => {
  const flat = render(<AthleteBar me={{ name: "A", meta: null }} opponent={{ name: "B", meta: null }} flatTop />);
  expect(flat.getByTestId("live-athlete-bar").props.style).toEqual(
    expect.objectContaining({ borderTopLeftRadius: 0, borderTopRightRadius: 0 }),
  );
  const round = render(<AthleteBar me={{ name: "A", meta: null }} opponent={{ name: "B", meta: null }} flatTop={false} />);
  expect(round.getByTestId("live-athlete-bar").props.style).toEqual(
    expect.objectContaining({ borderTopLeftRadius: 4 }),
  );
});
