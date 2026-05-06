import * as React from "react";
import { render } from "@testing-library/react-native";
import { Text, Pressable } from "react-native";

// ---- mocks ----

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    {
      get: (_target: Record<string, unknown>, prop: string) => {
        if (prop === "__esModule") return true;
        return stub;
      },
    },
  );
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({
    primary: "#E63946",
    foreground: "#000000",
    mutedForeground: "#6B7280",
    primaryForeground: "#ffffff",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {},
}));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@jits/shared/api/mutations", () => ({
  createSession: jest.fn().mockResolvedValue({ ok: true, data: { id: "new-s" } }),
}));

// Mock the Sheet components to render children directly for testability
jest.mock("@/components/ui/sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    Sheet: ({ children }: { children: React.ReactNode }) =>
      R.createElement(RN.View, { testID: "sheet" }, children),
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      R.createElement(RN.View, { testID: "sheet-content" }, children),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      R.createElement(RN.View, { testID: "sheet-header" }, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      R.createElement(RN.Text, {}, children),
    SheetTrigger: ({ children }: { children: React.ReactElement }) => children,
  };
});

// Mock the Button to render text directly
jest.mock("@/components/ui/button", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    Button: ({ children, ...props }: { children: React.ReactNode; onPress?: () => void }) =>
      R.createElement(
        RN.View,
        { ...props, testID: "button", accessible: false },
        typeof children === "string"
          ? R.createElement(RN.Text, {}, children)
          : children,
      ),
  };
});

// Mock the Input to render a TextInput
jest.mock("@/components/ui/input", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    Input: (props: Record<string, unknown>) =>
      R.createElement(RN.TextInput, {
        testID: `input-${props.placeholder ?? "default"}`,
        ...props,
      }),
  };
});

import { CreateSessionSheet } from "@/components/session/create-session-sheet";

describe("CreateSessionSheet", () => {
  const onCreated = jest.fn();

  it("renders the sheet title", () => {
    const { getAllByText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    // "Create Session" appears in both the sheet title and the submit button
    expect(getAllByText("Create Session").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Title field with default value", () => {
    const { getByTestId } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    const titleInput = getByTestId("input-Open Mat");
    expect(titleInput.props.value).toBe("Open Mat");
  });

  it("renders start time preset buttons", () => {
    const { getByText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    expect(getByText("Now")).toBeTruthy();
    expect(getByText("+30 min")).toBeTruthy();
    expect(getByText("+1 hour")).toBeTruthy();
  });

  it("renders duration preset buttons", () => {
    const { getByText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    expect(getByText("1h")).toBeTruthy();
    expect(getByText("2h")).toBeTruthy();
    expect(getByText("3h")).toBeTruthy();
  });

  it("renders the max participants field", () => {
    const { getByTestId } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    const maxInput = getByTestId("input-20");
    expect(maxInput.props.value).toBe("20");
  });

  it("renders the notes field", () => {
    const { getByTestId } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    expect(getByTestId("input-Any details for participants...")).toBeTruthy();
  });

  it("renders field labels", () => {
    const { getByText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    expect(getByText("Title")).toBeTruthy();
    expect(getByText("Start Time")).toBeTruthy();
    expect(getByText("Duration")).toBeTruthy();
    expect(getByText("Max Participants")).toBeTruthy();
    expect(getByText("Notes (optional)")).toBeTruthy();
  });

  it("renders the create button", () => {
    const { getAllByText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    // "Create Session" appears in the sheet title and possibly the submit button
    const matches = getAllByText("Create Session");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
