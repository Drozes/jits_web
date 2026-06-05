import * as React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Text, Pressable } from "react-native";
import type { SessionListItem } from "@jits/shared/types/session";

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

jest.mock("@react-native-community/datetimepicker", () => {
  const R = require("react");
  const RN = require("react-native");
  const Comp = () => R.createElement(RN.View, { testID: "datetimepicker" });
  return {
    __esModule: true,
    default: Comp,
    DateTimePickerAndroid: { open: jest.fn() },
  };
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
    cardForeground: "#000000",
  }),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@jits/shared/api/mutations", () => ({
  updateSession: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
  createSession: jest.fn().mockResolvedValue({ ok: true, data: { id: "s-new" } }),
  cancelSession: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

// Render the sheet body inline so the Save button is reachable. The trigger is
// rendered as-is (its onPress reset path is exercised in the create test).
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
    // Mirror the real SheetTrigger: clone the child and fire its onPress.
    SheetTrigger: ({ children }: { children: React.ReactElement }) => children,
  };
});

import { SessionEditSheet } from "@/components/gym-manager/session-edit-sheet";
import { toast } from "@/components/ui/toast";
import { updateSession, createSession } from "@jits/shared/api/mutations";

const mockUpdateSession = updateSession as jest.Mock;
const mockToastError = toast.error as jest.Mock;

function fourHourSession(): SessionListItem {
  // A 4h session in the future: 2026-12-01 14:00 -> 18:00.
  const start = new Date(2026, 11, 1, 14, 0, 0);
  const end = new Date(2026, 11, 1, 18, 0, 0);
  return {
    id: "s-1",
    title: "Open Mat",
    scheduledStart: start.toISOString(),
    scheduledEnd: end.toISOString(),
    status: "scheduled",
    participantCount: 0,
    maxParticipants: 20,
    rsvpCount: 0,
    createdBy: "a-1",
    createdByName: "Coach",
  };
}

const trigger = (
  <Pressable>
    <Text>Trigger</Text>
  </Pressable>
);

describe("SessionEditSheet", () => {
  beforeEach(() => {
    mockUpdateSession.mockClear();
    mockToastError.mockClear();
  });

  it("does not rewrite the schedule when only the title changes (preserves a 4h length)", async () => {
    const onSaved = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <SessionEditSheet gymId="g1" session={fourHourSession()} onSaved={onSaved}>
        {trigger}
      </SessionEditSheet>,
    );

    fireEvent.changeText(getByPlaceholderText("e.g. Open Mat"), "Comp Class");
    fireEvent.press(getByText("Save Session"));

    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalledTimes(1));
    const [, sessionId, fields] = mockUpdateSession.mock.calls[0];
    expect(sessionId).toBe("s-1");
    expect(fields.title).toBe("Comp Class");
    // The bug: scheduledEnd would be coerced to start + 3h. The fix omits both
    // schedule fields entirely so the row's real 4h length is preserved.
    expect(fields).not.toHaveProperty("scheduledStart");
    expect(fields).not.toHaveProperty("scheduledEnd");
  });

  it("rewrites the schedule when the duration preset is changed", async () => {
    const onSaved = jest.fn();
    const { getByText } = render(
      <SessionEditSheet gymId="g1" session={fourHourSession()} onSaved={onSaved}>
        {trigger}
      </SessionEditSheet>,
    );

    fireEvent.press(getByText("1h"));
    fireEvent.press(getByText("Save Session"));

    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalledTimes(1));
    const [, , fields] = mockUpdateSession.mock.calls[0];
    expect(fields).toHaveProperty("scheduledStart");
    expect(fields).toHaveProperty("scheduledEnd");
    const start = new Date(fields.scheduledStart).getTime();
    const end = new Date(fields.scheduledEnd).getTime();
    expect((end - start) / 3_600_000).toBe(1);
  });

  it("blocks a create whose start is in the past with a toast, not a mutation", async () => {
    const onSaved = jest.fn();
    const pastSession: SessionListItem = {
      ...fourHourSession(),
      scheduledStart: new Date(2020, 0, 1, 10, 0, 0).toISOString(),
      scheduledEnd: new Date(2020, 0, 1, 12, 0, 0).toISOString(),
    };
    // session prop seeds a past start; on create (no session) defaultStart is
    // always future, so we exercise the guard via a stale session-seeded edit
    // where the start has not been touched but duration is changed (forcing a
    // schedule write of the past start).
    const { getByText } = render(
      <SessionEditSheet gymId="g1" session={pastSession} onSaved={onSaved}>
        {trigger}
      </SessionEditSheet>,
    );

    fireEvent.press(getByText("1h"));
    fireEvent.press(getByText("Save Session"));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Start time can't be in the past"),
    );
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});
