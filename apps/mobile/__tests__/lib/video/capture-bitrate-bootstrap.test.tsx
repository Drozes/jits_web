/**
 * App-start priming for the dynamic capture bitrate (lib/video/
 * capture-bitrate-bootstrap.tsx; spec D6, D9, review M2): the codec cache and
 * the persisted kill switch are primed, then the switch is read once.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

const calls: string[] = [];
jest.mock("@/lib/video/capture-codecs", () => ({
  primeCaptureCodecCache: jest.fn(async () => {
    calls.push("codecs");
  }),
}));
jest.mock("@/lib/video/use-capture-bitrate", () => ({
  primeCaptureBitrateOff: jest.fn(async () => {
    calls.push("prime-off");
  }),
  readCaptureBitrateOff: jest.fn(async () => {
    calls.push("read-off");
    return false;
  }),
}));

import { CaptureBitrateBootstrap } from "@/lib/video/capture-bitrate-bootstrap";

it("primes both caches once on mount, then reads the kill switch after its disk value", async () => {
  const { rerender } = render(<CaptureBitrateBootstrap />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  rerender(<CaptureBitrateBootstrap />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(calls).toEqual(["codecs", "prime-off", "read-off"]);
});
