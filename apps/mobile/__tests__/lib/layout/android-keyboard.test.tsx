/**
 * Keyboard under Android edge-to-edge (jits-mafl.2 M9):
 *
 *  - `useAndroidKeyboardHeight` follows keyboardDidShow / keyboardDidHide on
 *    Android only, and only while enabled;
 *  - `SearchSelect` pads its results list by that height on Android, so the
 *    lowest matches stay above the keyboard (`automaticallyAdjustKeyboardInsets`
 *    is iOS-only);
 *  - guard: no KeyboardAvoidingView in app/ or components/ leaves Android
 *    without a behavior (`undefined` no longer works once the window stops
 *    resizing for the IME).
 *
 * Source: apps/mobile/lib/layout/android-keyboard-height.ts,
 * components/ui/search-select.tsx, app/profile-setup.tsx,
 * app/(app)/settings/feedback.tsx, app/(app)/settings/delete-account.tsx
 */
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
import { FlatList, Keyboard, Platform } from "react-native";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/layout/window-insets", () => ({ useWindowInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }) }));

import { useAndroidKeyboardHeight } from "@/lib/layout/android-keyboard-height";
import { SearchSelect } from "@/components/ui/search-select";

type KbListener = (e?: { endCoordinates: { height: number } }) => void;
let kb: Record<string, KbListener[]> = {};
const ORIGINAL_OS = Platform.OS;
function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
}
function emit(event: string, height = 0) {
  for (const l of kb[event] ?? []) l({ endCoordinates: { height } });
}

beforeEach(() => {
  kb = {};
  jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, fn: KbListener) => {
    (kb[event] ??= []).push(fn);
    return { remove: () => (kb[event] = kb[event].filter((l) => l !== fn)) };
  }) as never);
});

afterEach(() => {
  setOS(ORIGINAL_OS as "ios" | "android");
  jest.restoreAllMocks();
});

describe("useAndroidKeyboardHeight", () => {
  it("Android: the keyboard's height while shown, 0 once hidden", () => {
    setOS("android");
    const { result } = renderHook(() => useAndroidKeyboardHeight(true));
    expect(result.current).toBe(0);
    act(() => emit("keyboardDidShow", 300));
    expect(result.current).toBe(300);
    act(() => emit("keyboardDidHide"));
    expect(result.current).toBe(0);
  });

  it("iOS: always 0 and listens to nothing", () => {
    setOS("ios");
    const { result } = renderHook(() => useAndroidKeyboardHeight(true));
    expect(Keyboard.addListener).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });

  it("disabled: listens to nothing and resets to 0", () => {
    setOS("android");
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useAndroidKeyboardHeight(on), {
      initialProps: { on: true },
    });
    act(() => emit("keyboardDidShow", 280));
    rerender({ on: false });
    expect(result.current).toBe(0);
    expect(kb.keyboardDidShow).toHaveLength(0);
  });
});

describe("SearchSelect on Android", () => {
  it("pads the results list by the keyboard height", () => {
    setOS("android");
    const screen = render(
      <SearchSelect
        value=""
        onSelect={jest.fn()}
        title="City"
        placeholder="Pick a city"
        getOptions={() => [{ label: "Toronto", value: "Toronto" }]}
        testID="city"
      />,
    );
    fireEvent.press(screen.getByLabelText("City, Pick a city"));
    const padding = () =>
      (screen.UNSAFE_getByType(FlatList).props.contentContainerStyle as { paddingBottom: number }).paddingBottom;
    expect(padding()).toBe(10 + 24);
    act(() => emit("keyboardDidShow", 300));
    expect(padding()).toBe(10 + 24 + 300);
    act(() => emit("keyboardDidHide"));
    expect(padding()).toBe(10 + 24);
  });
});

describe("guard: KeyboardAvoidingView has an Android behavior", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx$/.test(entry.name)) out.push(full);
    }
    return out;
  }
  const files = ["app", "components"]
    .flatMap((d) => walk(path.join(ROOT, d)))
    .map((full) => ({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") }))
    .filter((f) => /<KeyboardAvoidingView\b/.test(f.src));

  it("covers the three M9 screens", () => {
    const rels = files.map((f) => f.rel);
    expect(rels).toEqual(
      expect.arrayContaining(["app/profile-setup.tsx", "app/(app)/settings/feedback.tsx", "app/(app)/settings/delete-account.tsx"]),
    );
  });

  it("none passes undefined (or no behavior) on Android", () => {
    const offenders = files.filter(
      (f) => /behavior=\{[^}]*:\s*undefined\s*\}/.test(f.src) || !/behavior=\{/.test(f.src),
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });
});
