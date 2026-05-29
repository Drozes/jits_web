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
    accentCta: "#E63946",
    textOnAccent: "#E8EDF2",
    textTertiary: "#6B7280",
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
    // The sheet header reads "New Session" and the submit button "Create Session".
    expect(getAllByText("New Session").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Create Session").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Title field with default value", () => {
    const { getByPlaceholderText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    const titleInput = getByPlaceholderText("Open Mat");
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
    // ELO compact labels: "+30m", "+1h"
    expect(getByText("+30m")).toBeTruthy();
    expect(getByText("+1h")).toBeTruthy();
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
    const { getByPlaceholderText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    const maxInput = getByPlaceholderText("20");
    expect(maxInput.props.value).toBe("20");
  });

  it("renders the notes field", () => {
    const { getByPlaceholderText } = render(
      <CreateSessionSheet gymId="g1" onCreated={onCreated}>
        <Pressable>
          <Text>Trigger</Text>
        </Pressable>
      </CreateSessionSheet>,
    );
    expect(getByPlaceholderText("Details for participants...")).toBeTruthy();
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
    expect(getAllByText("Create Session").length).toBeGreaterThanOrEqual(1);
  });
});
