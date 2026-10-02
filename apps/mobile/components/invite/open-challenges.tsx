import * as React from "react";
import { Alert, Text, View } from "react-native";
import { listMyOpenChallengeInvites, revokeInvite, type OpenChallengeInvite } from "@jits/shared/api/invites";
import { formatInviteCode, revokeInviteErrorMessage } from "@jits/shared/utils";
import { Button } from "@/components/ui/elo-system/button";
import { supabase } from "@/lib/supabase/client";

function sentAgo(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return "Sent just now";
  if (mins < 60) return `Sent ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Sent ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Sent ${days} ${days === 1 ? "day" : "days"} ago`;
}

/**
 * My other open challenge invites (the ones that count toward the 5-open
 * limit), each with Withdraw, so `too_many_open_invites` always has an action.
 * Hidden while there are none.
 */
export function OpenChallenges({
  athleteId,
  excludeInviteId,
  title = "Your open challenges",
  onWithdrawn,
  reloadKey = 0,
}: {
  athleteId: string | null;
  /** Bump to re-read the list (a screen coming back into focus). */
  reloadKey?: number;
  excludeInviteId?: string | null;
  title?: string;
  onWithdrawn?: () => void;
}) {
  const [rows, setRows] = React.useState<OpenChallengeInvite[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!athleteId) return;
    const res = await listMyOpenChallengeInvites(supabase, athleteId);
    if (res.ok) setRows(res.data);
  }, [athleteId]);

  React.useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const visible = rows.filter((r) => r.id !== excludeInviteId);
  if (visible.length === 0) return null;

  const withdraw = async (id: string) => {
    setBusyId(id);
    const res = await revokeInvite(supabase, id);
    setBusyId(null);
    if (!res.ok) {
      Alert.alert("Couldn't withdraw", revokeInviteErrorMessage(res.error.hint));
      void load();
      return;
    }
    setRows((cur) => cur.filter((r) => r.id !== id));
    onWithdrawn?.();
  };

  const now = Date.now();
  return (
    <View testID="open-challenges" className="gap-2">
      <Text className="font-mono tabular-nums text-caption uppercase tracking-caps-l text-ink-3">{title}</Text>
      {visible.map((r) => (
        <View
          key={r.id}
          testID={`open-challenge-${r.id}`}
          className="flex-row items-center justify-between gap-3 border-b border-hairline py-2"
        >
          <View className="flex-1 gap-0.5">
            <Text className="font-body text-callout text-ink">{sentAgo(r.created_at, now)}</Text>
            {r.short_code && r.code_expires_at && Date.parse(r.code_expires_at) > now ? (
              <Text className="font-mono tabular-nums text-small text-ink-3">Code {formatInviteCode(r.short_code)}</Text>
            ) : null}
          </View>
          <Button
            variant="ghost"
            height={28}
            style={{ paddingHorizontal: 0 }}
            label={busyId === r.id ? "Withdrawing..." : "Withdraw"}
            disabled={busyId !== null}
            onPress={() => void withdraw(r.id)}
          />
        </View>
      ))}
    </View>
  );
}
