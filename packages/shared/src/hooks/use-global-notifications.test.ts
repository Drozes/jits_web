// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGlobalNotifications } from "./use-global-notifications";
import type { NotificationPayload } from "../types/notification";

// ---------------------------------------------------------------------------
// Mock Supabase client with postgres_changes channels
// ---------------------------------------------------------------------------

type PostgresChangesHandler = (payload: {
  new: Record<string, unknown>;
}) => void;

function createMockChannels() {
  const channels: {
    name: string;
    pgHandlers: { event: string; handler: PostgresChangesHandler }[];
  }[] = [];

  function createChannel(name: string) {
    const pgHandlers: { event: string; handler: PostgresChangesHandler }[] = [];

    const channel = {
      on(
        type: string,
        opts: { event: string; schema?: string; table?: string; filter?: string },
        handler: PostgresChangesHandler,
      ) {
        if (type === "postgres_changes") {
          pgHandlers.push({ event: opts.event, handler });
        }
        return channel;
      },
      subscribe() {
        return channel;
      },
    };

    channels.push({ name, pgHandlers });
    return channel;
  }

  return {
    channels,
    createChannel,
    /** Find the channel by partial name match and simulate an INSERT/UPDATE. */
    simulateChange(
      channelNameIncludes: string,
      event: "INSERT" | "UPDATE",
      row: Record<string, unknown>,
    ) {
      const ch = channels.find((c) => c.name.includes(channelNameIncludes));
      if (!ch) throw new Error(`No channel matching "${channelNameIncludes}"`);
      for (const h of ch.pgHandlers) {
        if (h.event === event) {
          h.handler({ new: row });
        }
      }
    },
  };
}

function createMockSupabase(mockChannels: ReturnType<typeof createMockChannels>) {
  return {
    channel(name: string) {
      return mockChannels.createChannel(name);
    },
    removeChannel: vi.fn(),
    from(table: string) {
      return {
        select() {
          return {
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                display_name: "Test Athlete",
                profile_photo_url: "https://example.com/photo.jpg",
              },
            }),
          };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useGlobalNotifications", () => {
  let mockChannels: ReturnType<typeof createMockChannels>;
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let notify: ReturnType<typeof vi.fn<(p: NotificationPayload) => void>>;

  beforeEach(() => {
    mockChannels = createMockChannels();
    mockSupabase = createMockSupabase(mockChannels);
    notify = vi.fn();
  });

  const defaultProps = () => ({
    supabase: mockSupabase as never,
    currentAthleteId: "me-1",
    notify,
    getCurrentRoute: () => "/dashboard",
  });

  it("subscribes to message and challenge channels", () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    const names = mockChannels.channels.map((c) => c.name);
    expect(names.some((n) => n.includes("global-messages"))).toBe(true);
    expect(names.some((n) => n.includes("challenge-updates"))).toBe(true);
  });

  it("notifies on new message from another athlete", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    // Simulate a new message INSERT
    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-1",
      sender_id: "other-athlete",
      conversation_id: "conv-1",
      body: "Hello!",
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "message",
          title: "Test Athlete",
          body: "Hello!",
        }),
      );
    });
  });

  it("skips messages from the current athlete (own messages)", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-2",
      sender_id: "me-1",
      conversation_id: "conv-1",
      body: "My own message",
    });

    // Give a tick
    await new Promise((r) => setTimeout(r, 50));

    expect(notify).not.toHaveBeenCalled();
  });

  it("skips messages with no sender_id (system messages)", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-3",
      sender_id: null,
      conversation_id: "conv-1",
      body: "System notification",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(notify).not.toHaveBeenCalled();
  });

  it("suppresses message toast when viewing the conversation", async () => {
    const getRoute = () => "/messages/conv-1";

    renderHook(() =>
      useGlobalNotifications({
        ...defaultProps(),
        getCurrentRoute: getRoute,
      }),
    );

    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-4",
      sender_id: "other-athlete",
      conversation_id: "conv-1",
      body: "Should be suppressed",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(notify).not.toHaveBeenCalled();
  });

  it("calls onUnreadRefresh on new incoming messages", async () => {
    const onUnreadRefresh = vi.fn();

    renderHook(() =>
      useGlobalNotifications({
        ...defaultProps(),
        onUnreadRefresh,
      }),
    );

    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-5",
      sender_id: "other-athlete",
      conversation_id: "conv-2",
      body: "New message",
    });

    await waitFor(() => {
      expect(onUnreadRefresh).toHaveBeenCalled();
    });
  });

  it("notifies on challenge accepted", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    mockChannels.simulateChange("challenge-updates", "UPDATE", {
      id: "ch-1",
      status: "accepted",
      opponent_id: "opponent-a",
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "challenge",
          title: "Challenge Accepted!",
        }),
      );
    });
  });

  it("notifies on challenge declined", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    mockChannels.simulateChange("challenge-updates", "UPDATE", {
      id: "ch-2",
      status: "declined",
      opponent_id: "opponent-b",
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "challenge",
          title: "Challenge Declined",
        }),
      );
    });
  });

  it("notifies on challenge expired (as challenger)", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    mockChannels.simulateChange("challenge-updates", "UPDATE", {
      id: "ch-3",
      status: "expired",
      opponent_id: "opponent-c",
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "challenge",
          title: "Challenge Expired",
          body: expect.stringContaining("Test Athlete"),
        }),
      );
    });
  });

  it("uses custom buildMessageHref for message notifications", async () => {
    const buildMessageHref = (id: string) => `/custom/messages/${id}`;

    renderHook(() =>
      useGlobalNotifications({
        ...defaultProps(),
        buildMessageHref,
      }),
    );

    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-6",
      sender_id: "other-athlete",
      conversation_id: "conv-custom",
      body: "Custom href",
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          href: "/custom/messages/conv-custom",
        }),
      );
    });
  });

  it("uses custom buildLobbyHref for challenge notifications", async () => {
    const buildLobbyHref = (id: string) => `/custom/lobby/${id}`;

    renderHook(() =>
      useGlobalNotifications({
        ...defaultProps(),
        buildLobbyHref,
      }),
    );

    mockChannels.simulateChange("challenge-updates", "UPDATE", {
      id: "ch-4",
      status: "accepted",
      opponent_id: "opponent-d",
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          href: "/custom/lobby/ch-4",
        }),
      );
    });
  });

  it("cleans up both channels on unmount", () => {
    const { unmount } = renderHook(() =>
      useGlobalNotifications(defaultProps()),
    );

    unmount();

    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(2);
  });

  it("shows 'Sent an image' for messages with null body", async () => {
    renderHook(() => useGlobalNotifications(defaultProps()));

    mockChannels.simulateChange("global-messages", "INSERT", {
      id: "msg-7",
      sender_id: "other-athlete",
      conversation_id: "conv-3",
      body: null,
    });

    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Sent an image",
        }),
      );
    });
  });
});
