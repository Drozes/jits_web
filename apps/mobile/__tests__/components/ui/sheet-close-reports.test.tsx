/**
 * jits-mafl.2.1: a back during the present animation. gorhom either drops
 * the dismiss and settles open (onChange >= 0: the close is re-issued), or
 * closes without onChange(-1) (only onDismiss). Each sheet reports its close
 * once, whichever signal comes (or both, for a normal close).
 *
 * Source: components/highlight-viewer/pre-share-sheet.tsx,
 * components/arena/drift-prompt-sheet.tsx
 */
import * as React from "react";
import { AppState, BackHandler, Text } from "react-native";
import { act, render } from "@testing-library/react-native";

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockProps: { onChange?: (i: number) => void; onDismiss?: () => void } = {};
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
    R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
    mockProps = props as typeof mockProps;
    return R.createElement(RN.View, null, props.children);
  });
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  return { BottomSheetModal, BottomSheetView: Pass, BottomSheetBackdrop: () => null };
});
jest.mock("@/components/ui/sheet", () => ({ SheetBackdrop: () => null, useSheetChrome: () => ({}) }));
jest.mock("@/lib/theme/use-sheet-scheme-scope", () => ({
  useSheetSchemeScope: () => (children: React.ReactNode) => children,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockAnswer = jest.fn((_c: string) => Promise.resolve());
let mockPrompt: { busy: boolean } | null = { busy: false };
jest.mock("@/lib/arena/use-live-drift-check", () => ({
  useDriftPrompt: () => mockPrompt,
  answerDriftPrompt: (c: string) => mockAnswer(c),
}));
jest.mock("@/lib/arena/go-live-location", () => ({ useGoLiveLocationSheet: () => null }));
jest.mock("@/lib/arena/arena-store", () => ({ useLiveMenuOpen: () => false }));
jest.mock("@/components/ui/elo-system/button", () => ({ Button: () => null }));

import { PreShareSheet } from "@/components/highlight-viewer/pre-share-sheet";
import { DriftPromptSheet } from "@/components/arena/drift-prompt-sheet";

type BackListener = () => boolean | null | undefined;
let listeners: BackListener[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockProps = {};
  mockPrompt = { busy: false };
  listeners = [];
  // The drift prompt shows only while the app is active.
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_e: string, fn: BackListener) => {
    listeners.push(fn);
    return { remove: () => (listeners = listeners.filter((l) => l !== fn)) };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

const pressBack = () => [...listeners].reverse().some((l) => l());
const change = (i: number) => act(() => mockProps.onChange?.(i));
const dismissed = () => act(() => mockProps.onDismiss?.());

describe("PreShareSheet", () => {
  function mount() {
    const onClosed = jest.fn();
    render(
      <PreShareSheet open onClosed={onClosed}>
        <Text>Share</Text>
      </PreShareSheet>,
    );
    return onClosed;
  }

  it("a back whose close reports only onDismiss reports onClosed once", () => {
    const onClosed = mount();
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    dismissed();
    expect(onClosed).toHaveBeenCalledTimes(1);
    change(-1);
    dismissed();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("a dismiss gorhom dropped mid-present is re-issued once the sheet settles open", () => {
    mount();
    pressBack();
    change(0);
    expect(mockDismiss).toHaveBeenCalledTimes(2);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(2);
  });
});

describe("DriftPromptSheet", () => {
  it("a normal close reported twice (onChange(-1), then onDismiss) answers dismiss once", () => {
    render(<DriftPromptSheet blocked={false} />);
    expect(mockPresent).toHaveBeenCalledTimes(1);
    change(0);
    expect(pressBack()).toBe(true);
    change(-1);
    dismissed();
    expect(mockAnswer.mock.calls).toEqual([["dismiss"]]);
  });

  it("a back whose close reports only onDismiss answers dismiss once", () => {
    render(<DriftPromptSheet blocked={false} />);
    pressBack();
    dismissed();
    expect(mockAnswer.mock.calls).toEqual([["dismiss"]]);
  });

  it("a dismiss gorhom dropped mid-present is re-issued once the sheet settles open", () => {
    render(<DriftPromptSheet blocked={false} />);
    pressBack();
    change(0);
    expect(mockDismiss).toHaveBeenCalledTimes(2);
    expect(mockAnswer).not.toHaveBeenCalled();
  });
});
