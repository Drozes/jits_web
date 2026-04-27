/**
 * Realtime smoke-test harness
 * --------------------------------------------------------------------------
 * For MANUAL on-device verification by the developer. NOT a production screen.
 *
 * Phase 2 Track A spec: physical-device verification of Supabase realtime on
 * React Native. We can't run a device from the agent, so we wire a harness
 * the human dev can drive. Reachable from Settings only when `__DEV__` is true,
 * so it never ships to production.
 *
 * The four tests mirror every realtime pattern the app uses:
 *   1. Channel subscribe -- a no-op channel just to verify SUBSCRIBED status
 *   2. Presence -- join `app:online` (the same channel name the web uses) and
 *      log sync/join/leave events
 *   3. Broadcast -- send a payload to ourselves and confirm we receive it
 *   4. Postgres Changes -- listen to a low-risk read-only table (`gyms`),
 *      logging any INSERT/UPDATE/DELETE the dev triggers via supabase studio.
 *
 * AppState handling: we subscribe to `AppState.addEventListener("change", ...)`
 * and log foreground/background transitions. The plan flags this as a critical
 * RN concern -- mobile apps commonly drop realtime connections in background.
 *
 * On unmount every channel is removed so the harness leaves no leaked
 * subscriptions behind.
 */
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type Status = "idle" | "running" | "success" | "error";

interface TestState {
  status: Status;
  log: string[];
}

const initialState: TestState = { status: "idle", log: [] };

function appendLog(prev: TestState, line: string): TestState {
  const ts = new Date().toISOString().slice(11, 19);
  return { ...prev, log: [...prev.log, `[${ts}] ${line}`] };
}

export default function RealtimeSmokeTestScreen() {
  const [channelTest, setChannelTest] = useState<TestState>(initialState);
  const [presenceTest, setPresenceTest] = useState<TestState>(initialState);
  const [broadcastTest, setBroadcastTest] = useState<TestState>(initialState);
  const [postgresTest, setPostgresTest] = useState<TestState>(initialState);
  const [appStateLog, setAppStateLog] = useState<string[]>([]);

  // Channel handles so we can clean up on unmount.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<RealtimeChannel | null>(null);
  const broadcastRef = useRef<RealtimeChannel | null>(null);
  const postgresRef = useRef<RealtimeChannel | null>(null);

  // ---- AppState (foreground/background transitions) ----
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const ts = new Date().toISOString().slice(11, 19);
      setAppStateLog((prev) => [...prev, `[${ts}] ${next}`]);
    });
    return () => sub.remove();
  }, []);

  // ---- Cleanup on unmount: yank every active channel ----
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (presenceRef.current) supabase.removeChannel(presenceRef.current);
      if (broadcastRef.current) supabase.removeChannel(broadcastRef.current);
      if (postgresRef.current) supabase.removeChannel(postgresRef.current);
    };
  }, []);

  // ---- Test 1: plain channel subscribe ----
  function runChannelTest() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setChannelTest({ status: "running", log: [] });
    const channel = supabase.channel(`smoke-channel:${Date.now()}`);
    channel.subscribe((status, err) => {
      setChannelTest((prev) => appendLog(prev, `subscribe -> ${status}`));
      if (status === "SUBSCRIBED") {
        setChannelTest((prev) => ({ ...prev, status: "success" }));
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setChannelTest((prev) => ({
          ...appendLog(prev, err?.message ?? "no error message"),
          status: "error",
        }));
      }
    });
    channelRef.current = channel;
  }

  // ---- Test 2: app:online presence ----
  async function runPresenceTest() {
    if (presenceRef.current) {
      await supabase.removeChannel(presenceRef.current);
      presenceRef.current = null;
    }
    setPresenceTest({ status: "running", log: [] });

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? `anon-${Date.now()}`;
    setPresenceTest((prev) => appendLog(prev, `userId=${userId.slice(0, 8)}`));

    const channel = supabase.channel("app:online", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setPresenceTest((prev) =>
          appendLog(prev, `sync -> ${count} present`),
        );
      })
      .on("presence", { event: "join" }, ({ key }) => {
        setPresenceTest((prev) => appendLog(prev, `join: ${key.slice(0, 8)}`));
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        setPresenceTest((prev) => appendLog(prev, `leave: ${key.slice(0, 8)}`));
      })
      .subscribe(async (status) => {
        setPresenceTest((prev) => appendLog(prev, `subscribe -> ${status}`));
        if (status === "SUBSCRIBED") {
          await channel.track({ athlete_id: userId, source: "smoke" });
          setPresenceTest((prev) => ({
            ...appendLog(prev, "tracked self"),
            status: "success",
          }));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setPresenceTest((prev) => ({ ...prev, status: "error" }));
        }
      });

    presenceRef.current = channel;
  }

  // ---- Test 3: broadcast echo ----
  function runBroadcastTest() {
    if (broadcastRef.current) {
      supabase.removeChannel(broadcastRef.current);
      broadcastRef.current = null;
    }
    setBroadcastTest({ status: "running", log: [] });

    const channel = supabase
      .channel(`smoke-broadcast:${Date.now()}`, {
        config: { broadcast: { self: true } },
      })
      .on("broadcast", { event: "ping" }, ({ payload }) => {
        setBroadcastTest((prev) => ({
          ...appendLog(prev, `received ping: ${JSON.stringify(payload)}`),
          status: "success",
        }));
      })
      .subscribe(async (status) => {
        setBroadcastTest((prev) => appendLog(prev, `subscribe -> ${status}`));
        if (status === "SUBSCRIBED") {
          await channel.send({
            type: "broadcast",
            event: "ping",
            payload: { sentAt: new Date().toISOString() },
          });
          setBroadcastTest((prev) => appendLog(prev, "sent ping"));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setBroadcastTest((prev) => ({ ...prev, status: "error" }));
        }
      });

    broadcastRef.current = channel;
  }

  // ---- Test 4: postgres_changes on a low-risk table (`gyms`) ----
  function runPostgresTest() {
    if (postgresRef.current) {
      supabase.removeChannel(postgresRef.current);
      postgresRef.current = null;
    }
    setPostgresTest({ status: "running", log: [] });

    const channel = supabase
      .channel(`smoke-postgres:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gyms" },
        (payload) => {
          setPostgresTest((prev) =>
            appendLog(
              prev,
              `${payload.eventType}: ${
                "id" in (payload.new ?? {})
                  ? String((payload.new as { id?: string }).id ?? "?")
                  : "no id"
              }`,
            ),
          );
        },
      )
      .subscribe((status, err) => {
        setPostgresTest((prev) => appendLog(prev, `subscribe -> ${status}`));
        if (status === "SUBSCRIBED") {
          setPostgresTest((prev) => ({
            ...appendLog(prev, "listening; trigger an UPDATE in studio"),
            status: "success",
          }));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setPostgresTest((prev) => ({
            ...appendLog(prev, err?.message ?? "no error message"),
            status: "error",
          }));
        }
      });

    postgresRef.current = channel;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
    >
      <View>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>
          Realtime smoke test
        </Text>
        <Text style={{ marginTop: 4, color: "#737373", fontSize: 12 }}>
          Manual harness for verifying Supabase realtime on RN. Run each test;
          the status pill turns green on success.
        </Text>
      </View>

      <TestRow
        label="Channel subscribe"
        state={channelTest}
        onRun={runChannelTest}
      />
      <TestRow
        label="Presence (app:online)"
        state={presenceTest}
        onRun={runPresenceTest}
      />
      <TestRow
        label="Broadcast (self echo)"
        state={broadcastTest}
        onRun={runBroadcastTest}
      />
      <TestRow
        label="Postgres Changes (gyms)"
        state={postgresTest}
        onRun={runPostgresTest}
      />

      <View
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#e5e5e5",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600" }}>AppState log</Text>
        <Text style={{ fontSize: 11, color: "#737373", marginTop: 2 }}>
          Background the app and bring it back to foreground; entries should
          appear here.
        </Text>
        <View style={{ marginTop: 8, gap: 2 }}>
          {appStateLog.length === 0 ? (
            <Text style={{ fontSize: 11, color: "#a3a3a3" }}>
              (no transitions yet)
            </Text>
          ) : (
            appStateLog.slice(-10).map((line, i) => (
              <Text
                key={i}
                style={{ fontSize: 11, fontFamily: "Courier", color: "#404040" }}
              >
                {line}
              </Text>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function statusColor(status: Status): string {
  switch (status) {
    case "success":
      return "#15803d";
    case "running":
      return "#a16207";
    case "error":
      return "#b91c1c";
    case "idle":
    default:
      return "#737373";
  }
}

function TestRow({
  label,
  state,
  onRun,
}: {
  label: string;
  state: TestState;
  onRun: () => void;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 8,
        padding: 12,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "600" }}>{label}</Text>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: statusColor(state.status),
            textTransform: "uppercase",
          }}
        >
          {state.status}
        </Text>
      </View>
      <Pressable
        onPress={onRun}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#171717",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 6,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
          {state.status === "idle" ? "Start" : "Restart"}
        </Text>
      </Pressable>
      {state.log.length > 0 && (
        <View
          style={{
            backgroundColor: "#fafafa",
            borderRadius: 4,
            padding: 8,
            gap: 2,
          }}
        >
          {state.log.slice(-8).map((line, i) => (
            <Text
              key={i}
              style={{ fontSize: 11, fontFamily: "Courier", color: "#404040" }}
            >
              {line}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
