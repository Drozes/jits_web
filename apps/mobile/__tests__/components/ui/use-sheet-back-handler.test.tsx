/**
 * Android hardware back on gorhom sheets (jits-mafl.2 M7):
 *
 *  - `useSheetBackHandler` registers only while the sheet is open, consumes
 *    the back (returns true), calls `onBack` once per opening (no second
 *    dismiss while gorhom animates out), swallows it while busy, and goes
 *    away when the sheet closes or unmounts;
 *  - `Sheet` / `SheetContent` and `FormSheet` close on back, and only a
 *    sheet they presented;
 *  - guard: every `BottomSheetModal` in app/ and components/ uses the hook.
 *
 * Source: apps/mobile/components/ui/use-sheet-back-handler.ts, sheet.tsx,
 * form-sheet.tsx
 */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { BackHandler, Text } from "react-native";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnChange: ((i: number) => void) | null = null;
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef(
    (props: { children?: React.ReactNode; onChange?: (i: number) => void }, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      mockOnChange = props.onChange ?? null;
      return R.createElement(RN.View, { testID: "gorhom-sheet" }, props.children);
    },
  );
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  return { BottomSheetModal, BottomSheetView: Pass, BottomSheetBackdrop: () => null };
});
jest.mock("@/lib/theme/use-sheet-scheme-scope", () => ({
  useSheetSchemeScope: () => (children: React.ReactNode) => children,
}));

import { useSheetBackHandler } from "@/components/ui/use-sheet-back-handler";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { FormSheet } from "@/components/ui/form-sheet";

type BackListener = () => boolean | null | undefined;
let listeners: BackListener[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockOnChange = null;
  listeners = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_e: string, fn: BackListener) => {
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter((l) => l !== fn);
      },
    };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** What React Native does: newest listener first, stop at the first `true`. */
function pressBack(): boolean {
  for (const l of [...listeners].reverse()) if (l()) return true;
  return false;
}

describe("useSheetBackHandler", () => {
  it("registers nothing while closed", () => {
    const onBack = jest.fn();
    renderHook(() => useSheetBackHandler({ open: false, onBack }));
    expect(listeners).toHaveLength(0);
    expect(pressBack()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("while open: consumes the back and calls onBack once per opening", () => {
    const onBack = jest.fn();
    const { rerender } = renderHook(({ open }: { open: boolean }) => useSheetBackHandler({ open, onBack }), {
      initialProps: { open: true },
    });
    expect(pressBack()).toBe(true);
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(listeners).toHaveLength(0);
    expect(pressBack()).toBe(false);
    rerender({ open: true });
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("while busy: consumes the back without closing, then closes once not busy", () => {
    const onBack = jest.fn();
    const { rerender } = renderHook(({ busy }: { busy: boolean }) => useSheetBackHandler({ open: true, busy, onBack }), {
      initialProps: { busy: true },
    });
    expect(pressBack()).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    rerender({ busy: false });
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onBack and removes its listener on unmount", () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender, unmount } = renderHook(({ fn }: { fn: () => void }) => useSheetBackHandler({ open: true, onBack: fn }), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    pressBack();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it("stacked sheets: the one opened last closes first", () => {
    const lower = jest.fn();
    const upper = jest.fn();
    renderHook(() => useSheetBackHandler({ open: true, onBack: lower }));
    const top = renderHook(({ open }: { open: boolean }) => useSheetBackHandler({ open, onBack: upper }), {
      initialProps: { open: true },
    });
    pressBack();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    top.rerender({ open: false });
    pressBack();
    expect(lower).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet / SheetContent", () => {
  function Harness() {
    return (
      <Sheet>
        <SheetTrigger>
          <Text>Open</Text>
        </SheetTrigger>
        <SheetContent>
          <Text>Body</Text>
        </SheetContent>
      </Sheet>
    );
  }

  it("never presented: back passes through", () => {
    render(<Harness />);
    expect(pressBack()).toBe(false);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("open: back dismisses once; once closed, back passes through again", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(pressBack()).toBe(true);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    act(() => mockOnChange?.(-1));
    expect(pressBack()).toBe(false);
  });

  it("closed by a swipe: back passes through and never dismisses a closed sheet", () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByText("Open"));
    act(() => mockOnChange?.(-1));
    expect(pressBack()).toBe(false);
    expect(mockDismiss).not.toHaveBeenCalled();
  });
});

describe("FormSheet", () => {
  function mount(props: { open: boolean; busy: boolean }) {
    const onClosed = jest.fn();
    const utils = render(
      <FormSheet {...props} onClosed={onClosed}>
        <Text>Form</Text>
      </FormSheet>,
    );
    return { ...utils, onClosed };
  }

  it("open: back dismisses the sheet it presented", () => {
    mount({ open: true, busy: false });
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(pressBack()).toBe(true);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("busy: back is swallowed and the sheet stays", () => {
    mount({ open: true, busy: true });
    expect(pressBack()).toBe(true);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it("closed: back passes through", () => {
    mount({ open: false, busy: false });
    expect(pressBack()).toBe(false);
  });
});

describe("guard: every gorhom sheet handles the Android back", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }
  const files = ["app", "components"]
    .flatMap((d) => walk(path.join(ROOT, d)))
    .map((full) => ({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") }))
    .filter((f) => /<BottomSheetModal\s/.test(f.src));

  it("finds the sheets", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it("each file that renders a BottomSheetModal calls useSheetBackHandler", () => {
    expect(files.filter((f) => !/useSheetBackHandler\(/.test(f.src)).map((f) => f.rel)).toEqual([]);
  });
});
