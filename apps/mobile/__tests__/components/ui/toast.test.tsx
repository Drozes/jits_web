/**
 * Branded toasts (jits-4zp.4, UX-09): the library's stock card (white, blue
 * info rule, drop shadow) is replaced by an ELO card. Success is neutral ink
 * (Gain Green is for rating increases only), error is Signal Red, info is
 * tertiary ink; never a shadow; 4px radius.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

let mockHostProps: Record<string, unknown> = {};
const mockShow = jest.fn();
jest.mock("react-native-toast-message", () => {
  const R = require("react");
  const RN = require("react-native");
  const Host = (props: Record<string, unknown>) => {
    mockHostProps = props;
    return R.createElement(RN.View, { testID: "toast-host" });
  };
  Host.show = (p: unknown) => mockShow(p);
  Host.hide = jest.fn();
  return { __esModule: true, default: Host };
});

import { BrandToast, Toaster, toast, toastConfig } from "@/components/ui/toast";

beforeEach(() => {
  mockShow.mockClear();
  mockHostProps = {};
});

describe("Toaster", () => {
  it("mounts the library host with the branded config", () => {
    render(<Toaster />);
    expect(mockHostProps.config).toBe(toastConfig);
    expect(Object.keys(toastConfig).sort()).toEqual(["error", "info", "success"]);
  });
});

describe("BrandToast", () => {
  const cases = [
    ["success", "border-l-ink"],
    ["error", "border-l-cta"],
    ["info", "border-l-ink-3"],
  ] as const;

  it.each(cases)("%s uses the %s rule and no shadow", (type, rule) => {
    const { getByTestId, getByText } = render(
      <BrandToast type={type} text1="Title" text2="Body copy" />,
    );
    const card = getByTestId(`toast-${type}`);
    const cls = String(card.props.className ?? "");
    expect(cls.split(/\s+/)).toContain(rule);
    expect(cls).toMatch(/\brounded-md\b/); // 4px
    expect(cls).not.toMatch(/shadow|positive|blue/);
    expect(card.props.style).toEqual(expect.objectContaining({ shadowOpacity: 0, elevation: 0 }));
    getByText("Title");
    getByText("Body copy");
  });

  it("success is never Gain Green", () => {
    const { getByTestId } = render(<BrandToast type="success" text1="Saved locally" />);
    expect(String(getByTestId("toast-success").props.className)).not.toMatch(/positive|green/);
  });

  it("omits the body line when there is no description", () => {
    const { queryAllByText } = render(<BrandToast type="info" text1="Only a title" />);
    expect(queryAllByText(/./)).toHaveLength(1);
  });

  it("the config renders the branded card for each type", () => {
    const el = toastConfig.error!({
      type: "error",
      position: "top",
      isVisible: true,
      text1: "Couldn't confirm",
      text2: "nope",
      show: jest.fn(),
      hide: jest.fn(),
      onPress: jest.fn(),
      props: {},
    });
    const { getByTestId, getByText } = render(<>{el}</>);
    getByTestId("toast-error");
    getByText("Couldn't confirm");
  });
});

describe("toast announces to VoiceOver", () => {
  it("announces title and description", () => {
    const spy = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    toast.error({ text1: "Couldn't confirm", description: "nope" });
    expect(spy).toHaveBeenCalledWith("Couldn't confirm. nope");
    toast.info("Plain");
    expect(spy).toHaveBeenLastCalledWith("Plain");
    spy.mockRestore();
  });
});

describe("toast API (unchanged)", () => {
  it("maps description to text2 and sets the type", () => {
    toast.error({ text1: "Couldn't record result", description: "nope" });
    expect(mockShow).toHaveBeenCalledWith({
      type: "error",
      text1: "Couldn't record result",
      text2: "nope",
    });
    toast.info("Plain");
    expect(mockShow).toHaveBeenLastCalledWith({ type: "info", text1: "Plain" });
  });
});
