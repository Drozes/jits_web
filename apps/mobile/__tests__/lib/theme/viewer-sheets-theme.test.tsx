/**
 * The highlight viewer is pinned dark (`ForceDarkTheme`) in both app themes,
 * but gorhom portals a BottomSheetModal's content to the root provider,
 * OUTSIDE that scope. The two sheets opened from the viewer (pre-share and
 * Improve) must therefore re-enter the scheme they were opened under, so the
 * sheet background (computed at the opener) and the portalled content agree.
 * The gorhom stand-in below renders content in a separate host outside the
 * opener's tree, as the real provider does; theme-provider is NOT mocked.
 */
import * as React from "react";
import { Text, View } from "react-native";
import { act, render } from "@testing-library/react-native";

let mockScheme: "light" | "dark" = "light";
jest.mock("nativewind", () => ({
  ...jest.requireActual("nativewind"),
  useColorScheme: () => ({ colorScheme: mockScheme, setColorScheme: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Portal-faithful gorhom stand-in: present() hands the content to a host
// rendered as a SIBLING of the opener, so no opener context reaches it.
type SheetProps = {
  children: React.ReactNode;
  backgroundStyle?: { backgroundColor?: string };
  handleIndicatorStyle?: { backgroundColor?: string };
};
let mockSetHost: ((n: React.ReactNode) => void) | null = null;
const mockSheetProps: SheetProps[] = [];
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  const BottomSheetModal = R.forwardRef((props: SheetProps, ref: unknown) => {
    const [shown, setShown] = R.useState(false);
    R.useImperativeHandle(ref, () => ({ present: () => setShown(true), dismiss: () => setShown(false) }));
    mockSheetProps.push(props);
    R.useEffect(() => {
      mockSetHost?.(shown ? R.createElement(RN.View, { testID: "portal-content" }, props.children) : null);
    });
    return null;
  });
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  return { BottomSheetModal, BottomSheetView: Pass, BottomSheetBackdrop: () => null };
});

import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import { useResolvedColorScheme, useThemedTokens } from "@/lib/theme/use-theme";
import { darkTokens, lightTokens } from "@/lib/tokens";
import { PreShareSheet } from "@/components/highlight-viewer/pre-share-sheet";
import { HighlightFeedbackSheet } from "@/components/match-detail/highlight/highlight-feedback-sheet";

function PortalHost() {
  const [node, setNode] = React.useState<React.ReactNode>(null);
  mockSetHost = setNode;
  return <>{node}</>;
}

function Probe() {
  const scheme = useResolvedColorScheme();
  const tokens = useThemedTokens();
  return <Text testID="probe">{`${scheme}:${tokens.textPrimary}`}</Text>;
}

const SHEETS = [
  ["PreShareSheet", (c: React.ReactNode) => <PreShareSheet open onClosed={jest.fn()}>{c}</PreShareSheet>],
  [
    "HighlightFeedbackSheet",
    (c: React.ReactNode) => (
      <HighlightFeedbackSheet open busy={false} onClosed={jest.fn()}>
        {c}
      </HighlightFeedbackSheet>
    ),
  ],
] as const;

async function renderSheet(sheet: (c: React.ReactNode) => React.ReactElement, forcedDark: boolean) {
  const opener = sheet(<Probe />);
  const utils = render(
    <View>
      <PortalHost />
      {forcedDark ? <ForceDarkTheme>{opener}</ForceDarkTheme> : opener}
    </View>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

beforeEach(() => {
  mockScheme = "light";
  mockSheetProps.length = 0;
  mockSetHost = null;
});

describe.each(SHEETS)("%s", (_name, sheet) => {
  it("opened from the forced-dark viewer in the LIGHT app theme: portalled content, background and handle are all dark", async () => {
    const utils = await renderSheet(sheet, true);
    const portal = utils.getByTestId("portal-content");
    // The content sits in its own forced-dark scope inside the portal.
    expect(portal.findByType(ForceDarkTheme).findByProps({ testID: "probe" })).toBeTruthy();
    expect(utils.getByTestId("probe")).toHaveTextContent(`dark:${darkTokens.textPrimary}`);
    const props = mockSheetProps[mockSheetProps.length - 1];
    expect(props.backgroundStyle?.backgroundColor).toBe(darkTokens.bgSecondary);
    expect(props.handleIndicatorStyle?.backgroundColor).toBe(darkTokens.textTertiary);
  });

  it("opened from a themed screen (match detail) in the light theme: follows the app theme, no forced scope", async () => {
    const utils = await renderSheet(sheet, false);
    expect(utils.getByTestId("portal-content").findAllByType(ForceDarkTheme)).toHaveLength(0);
    expect(utils.getByTestId("probe")).toHaveTextContent(`light:${lightTokens.textPrimary}`);
    const props = mockSheetProps[mockSheetProps.length - 1];
    expect(props.backgroundStyle?.backgroundColor).toBe(lightTokens.bgSecondary);
    expect(props.handleIndicatorStyle?.backgroundColor).toBe(lightTokens.textTertiary);
  });
});
