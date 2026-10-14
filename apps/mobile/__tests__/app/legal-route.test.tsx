/**
 * The legal modal route (jits-rog5.8): `app/legal/[doc].tsx` shows the Terms
 * or the Privacy Policy, switches EN / FR in place, closes, and is
 * registered as a modal on the ROOT stack (outside `(app)`), so it opens
 * signed out and over profile setup.
 */
import * as React from "react";
import { AccessibilityInfo, BackHandler, FlatList } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

declare const __dirname: string;
const fs = require("fs") as { existsSync: (p: string) => boolean; readFileSync: (p: string, e: string) => string };
const path = require("path") as { join: (...parts: string[]) => string };

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }) }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textPrimary: "#fff" }) }));

import LegalDocumentScreen from "@/app/legal/[doc]";
import { legalHref } from "@/lib/legal/legal-copy";
import { LEGAL_DOCUMENTS, documentOutline, parseLegalDocument, sectionIndex } from "@jits/shared/legal";

const scrollToIndex = jest.spyOn(FlatList.prototype, "scrollToIndex").mockImplementation(() => undefined);
const termsBlocks = parseLegalDocument("terms", LEGAL_DOCUMENTS.terms.en.markdown);
const privacyBlocks = parseLegalDocument("privacy", LEGAL_DOCUMENTS.privacy.en.markdown);

const APP_DIR = path.join(__dirname, "..", "..", "app");

beforeEach(() => {
  jest.clearAllMocks();
  scrollToIndex.mockClear();
  mockCanGoBack = true;
  mockParams = {};
});

describe("legal modal route", () => {
  it("shows the Terms in English by default", () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    expect(screen.getByRole("header", { name: "Terms of Service" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "ELO RATED Terms of Service" })).toBeTruthy();
    expect(screen.getByTestId("legal-lang-en").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("shows the Privacy Policy, and French when asked", () => {
    mockParams = { doc: "privacy", lang: "fr" };
    render(<LegalDocumentScreen />);
    expect(screen.getByRole("header", { name: "Politique de confidentialité" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Politique de confidentialité d'ELO RATED" })).toBeTruthy();
  });

  it("switches language in place with the EN / FR toggle", () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    fireEvent.press(screen.getByTestId("legal-lang-fr"));
    expect(screen.getByRole("header", { name: "Conditions d'utilisation d'ELO RATED" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "ELO RATED Terms of Service" })).toBeNull();
    expect(screen.getByTestId("legal-lang-fr").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId("legal-lang-en"));
    expect(screen.getByRole("header", { name: "ELO RATED Terms of Service" })).toBeTruthy();
  });

  it("falls back to the Terms for an unknown doc or language", () => {
    mockParams = { doc: "eula", lang: "de" };
    render(<LegalDocumentScreen />);
    expect(screen.getByRole("header", { name: "ELO RATED Terms of Service" })).toBeTruthy();
  });

  it("closes back to where it was opened, or home when opened cold", () => {
    mockParams = { doc: "privacy" };
    render(<LegalDocumentScreen />);
    fireEvent.press(screen.getByTestId("legal-close"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    fireEvent.press(screen.getByTestId("legal-close"));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("is a root-stack modal, outside the signed-in (app) group", () => {
    expect(fs.existsSync(path.join(APP_DIR, "legal", "[doc].tsx"))).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, "(app)", "legal"))).toBe(false);
    const layout = fs.readFileSync(path.join(APP_DIR, "_layout.tsx"), "utf8");
    expect(layout).toMatch(/<Stack\.Screen name="legal\/\[doc\]" options=\{\{ presentation: "modal" \}\} \/>/);
  });

  it("builds its links one way", () => {
    expect(legalHref("terms")).toBe("/legal/terms");
    expect(legalHref("privacy", "fr")).toBe("/legal/privacy?lang=fr");
    expect(legalHref("terms", undefined, "5")).toBe("/legal/terms?section=5");
    expect(legalHref("terms", "fr", "24.3")).toBe("/legal/terms?lang=fr&section=24.3");
  });

  it("switches document in place with the Terms | Privacy control, keeping the language", () => {
    mockParams = { doc: "terms", lang: "fr" };
    render(<LegalDocumentScreen />);
    expect(screen.getByTestId("legal-doc-terms").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("legal-doc-terms")).toHaveTextContent("Conditions");
    expect(screen.getByTestId("legal-doc-privacy")).toHaveTextContent("Confidentialité");
    fireEvent.press(screen.getByTestId("legal-doc-privacy"));
    expect(screen.getByRole("header", { name: "Politique de confidentialité d'ELO RATED" })).toBeTruthy();
    expect(screen.getByTestId("legal-doc-privacy").props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId("legal-lang-fr").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("lists the H2 sections under Contents and jumps to the one tapped", () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    expect(screen.getByTestId("legal-contents")).toHaveTextContent("Contents");
    fireEvent.press(screen.getByTestId("legal-contents"));
    const h2 = documentOutline(termsBlocks).filter((e) => e.level === 2);
    const target = h2.find((e) => e.section === "27")!;
    expect(screen.getByTestId(`legal-outline-${h2[0].index}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId(`legal-outline-${target.index}`));
    expect(scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index: target.index }));
    expect(screen.queryByTestId("legal-contents-panel")).toBeNull();
  });

  it("names the Contents button in French", () => {
    mockParams = { doc: "privacy", lang: "fr" };
    render(<LegalDocumentScreen />);
    expect(screen.getByTestId("legal-contents")).toHaveTextContent("Sommaire");
  });

  function openContentsAndPick(section: string) {
    fireEvent.press(screen.getByTestId("legal-contents"));
    const entry = documentOutline(termsBlocks).find((e) => e.level === 2 && e.section === section)!;
    fireEvent.press(screen.getByTestId(`legal-outline-${entry.index}`));
    return entry.index;
  }

  it("recovers a jump to a row not measured yet: scrolls near it, then retries (bounded)", () => {
    jest.useFakeTimers();
    const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset").mockImplementation(() => undefined);
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    const index = openContentsAndPick("27");
    const list = screen.UNSAFE_getByType(FlatList);
    scrollToIndex.mockClear();
    act(() => list.props.onScrollToIndexFailed({ index, averageItemLength: 50, highestMeasuredFrameIndex: 15 }));
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 50 * index, animated: false });
    act(() => jest.advanceTimersByTime(60));
    expect(scrollToIndex).toHaveBeenLastCalledWith(expect.objectContaining({ index }));
    for (let i = 0; i < 10; i++) act(() => list.props.onScrollToIndexFailed({ index, averageItemLength: 50, highestMeasuredFrameIndex: 15 }));
    expect(scrollToOffset.mock.calls.length).toBeLessThanOrEqual(5);
    scrollToOffset.mockRestore();
    jest.useRealTimers();
  });

  it("a newer jump cancels the older one's pending retry, and a failure for another row is ignored", () => {
    jest.useFakeTimers();
    const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset").mockImplementation(() => undefined);
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    const first = openContentsAndPick("27");
    const list = screen.UNSAFE_getByType(FlatList);
    act(() => list.props.onScrollToIndexFailed({ index: first, averageItemLength: 50, highestMeasuredFrameIndex: 15 }));
    const second = openContentsAndPick("3");
    scrollToIndex.mockClear();
    act(() => jest.advanceTimersByTime(200));
    expect(scrollToIndex.mock.calls.map((c) => c[0].index)).not.toContain(first);
    scrollToOffset.mockClear();
    act(() => list.props.onScrollToIndexFailed({ index: first, averageItemLength: 50, highestMeasuredFrameIndex: 15 }));
    expect(scrollToOffset).not.toHaveBeenCalled();
    expect(second).not.toBe(first);
    scrollToOffset.mockRestore();
    jest.useRealTimers();
  });

  it("Android back closes an open Contents panel, not the modal", () => {
    const handlers: (() => boolean)[] = [];
    const remove = jest.fn();
    const add = jest.spyOn(BackHandler, "addEventListener").mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove };
    });
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    expect(handlers).toHaveLength(0);
    fireEvent.press(screen.getByTestId("legal-contents"));
    expect(screen.getByTestId("legal-contents-panel")).toBeTruthy();
    let handled = false;
    act(() => {
      handled = handlers[handlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(screen.queryByTestId("legal-contents-panel")).toBeNull();
    expect(remove).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    add.mockRestore();
  });

  it("the Contents panel is modal for screen readers, hides the text behind it, and takes focus on its header", async () => {
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => undefined);
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    expect(screen.getByTestId("legal-document-wrap").props.importantForAccessibility).toBe("auto");
    fireEvent.press(screen.getByTestId("legal-contents"));
    expect(screen.getByTestId("legal-contents-panel").props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByTestId("legal-contents-title").props.accessibilityRole).toBe("header");
    const wrap = screen.getByTestId("legal-document-wrap", { includeHiddenElements: true });
    expect(wrap.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(wrap.props.accessibilityElementsHidden).toBe(true);
    await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), "focus"));
    expect(focus.mock.calls[0][0]).toBeTruthy();
    focus.mockRestore();
  });

  it("does not move focus after the Contents panel closed before its first frame", async () => {
    jest.useFakeTimers();
    const focus = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent").mockImplementation(() => undefined);
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    fireEvent.press(screen.getByTestId("legal-contents"));
    expect(focus).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("legal-contents"));
    act(() => jest.runOnlyPendingTimers());
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
    jest.useRealTimers();
  });

  it("leaves the Terms' own in-text Contents heading out of the panel", () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    fireEvent.press(screen.getByTestId("legal-contents"));
    const own = documentOutline(termsBlocks).find((e) => e.text === "Contents")!;
    expect(screen.queryByTestId(`legal-outline-${own.index}`)).toBeNull();
    const keyPoints = documentOutline(termsBlocks).find((e) => e.text === "Key points (please read)")!;
    expect(screen.getByTestId(`legal-outline-${keyPoints.index}`)).toBeTruthy();
  });

  it("the Terms' own Contents list items jump to their sections", async () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    const item = screen.getAllByTestId("legal-ref-terms-29").find((el) => /Contact us/.test(String(el.props.children)))!;
    expect(item).toBeTruthy();
    await act(async () => fireEvent.press(item));
    await waitFor(() =>
      expect(scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: sectionIndex(termsBlocks).get("29") })),
    );
  });

  it("caps the header labels at 1.3x Dynamic Type", () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    expect(screen.getByRole("header", { name: "Terms of Service" }).props.maxFontSizeMultiplier).toBe(1.3);
    expect(within(screen.getByTestId("legal-contents")).getByText("Contents").props.maxFontSizeMultiplier).toBe(1.3);
    expect(within(screen.getByTestId("legal-doc-terms")).getByText("Terms").props.maxFontSizeMultiplier).toBe(1.3);
    expect(screen.getByText("EN").props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("opens at ?section=", async () => {
    mockParams = { doc: "terms", section: "24.3" };
    render(<LegalDocumentScreen />);
    await waitFor(() =>
      expect(scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: sectionIndex(termsBlocks).get("24.3") })),
    );
  });

  it("follows in-text references: a section jumps, the other document switches", async () => {
    mockParams = { doc: "terms" };
    render(<LegalDocumentScreen />);
    const [section5] = screen.getAllByTestId("legal-ref-terms-5");
    await act(async () => fireEvent.press(section5));
    await waitFor(() =>
      expect(scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: sectionIndex(termsBlocks).get("5") })),
    );
    const [privacy] = screen.getAllByTestId("legal-ref-privacy-doc");
    fireEvent.press(privacy);
    expect(screen.getByRole("header", { name: "ELO RATED Privacy Policy" })).toBeTruthy();
    expect(privacyBlocks.length).toBeGreaterThan(0);
  });
});
