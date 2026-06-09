import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/elo-system";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { useManagedGyms } from "@/lib/admin/use-managed-gyms";
import { supabase } from "@/lib/supabase/client";
import { addGymManager, removeGymManager } from "@jits/shared/api/mutations";
import type {
  AdminAthlete,
  AdminManagedGym,
  GymOption,
} from "@jits/shared/api/queries";

/**
 * Gym-owner (gym_managers) manager for one selected member. Lists the gyms the
 * member owns (with revoke) and a gym picker to grant a new one. Available gyms
 * exclude already-owned ones; the list reloads after every grant/revoke. Any
 * admin can use this (the server gates on is_admin()).
 */
export function MemberGymOwnerSection({
  member,
  gyms,
}: {
  member: AdminAthlete;
  gyms: GymOption[];
}) {
  const { gyms: managed, isLoading, reload } = useManagedGyms(member.id);
  const [pendingGymId, setPendingGymId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const managedIds = React.useMemo(
    () => new Set(managed.map((g) => g.gym_id)),
    [managed],
  );
  const available = React.useMemo(
    () =>
      gyms
        .filter((g) => !managedIds.has(g.id))
        .map((g) => ({
          label: g.city ? `${g.name} — ${g.city}` : g.name,
          value: g.id,
        })),
    [gyms, managedIds],
  );

  // Reset the pending pick when switching members.
  React.useEffect(() => setPendingGymId(""), [member.id]);

  const handleAdd = React.useCallback(async () => {
    if (!pendingGymId) return;
    setBusy(true);
    const result = await addGymManager(supabase, {
      gymId: pendingGymId,
      athleteId: member.id,
    });
    setBusy(false);
    if (result.ok) {
      toast.success(`${member.display_name} is now a gym owner`);
      setPendingGymId("");
      reload();
    } else {
      toast.error(result.error.message);
    }
  }, [pendingGymId, member.id, member.display_name, reload]);

  const handleRemove = React.useCallback(
    (gym: AdminManagedGym) => {
      Alert.alert(
        "Remove gym owner?",
        `Remove ${member.display_name} as owner of ${gym.gym_name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              const result = await removeGymManager(supabase, {
                gymId: gym.gym_id,
                athleteId: member.id,
              });
              if (result.ok) {
                toast.success(`Removed from ${gym.gym_name}`);
                reload();
              } else {
                toast.error(result.error.message);
              }
            },
          },
        ],
      );
    },
    [member.id, member.display_name, reload],
  );

  return (
    <Plate className="gap-4">
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        GYM OWNERSHIP
      </Text>

      {isLoading ? null : managed.length > 0 ? (
        <View className="gap-3">
          {managed.map((g) => (
            <View
              key={g.gym_id}
              className="flex-row items-center justify-between gap-3"
            >
              <View className="flex-1 min-w-0">
                <Text
                  className="font-body text-[13px] text-ink"
                  numberOfLines={1}
                >
                  {g.gym_name}
                </Text>
                {g.city ? (
                  <Text
                    className="font-mono text-[10px] text-ink-3"
                    numberOfLines={1}
                  >
                    {g.city}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => handleRemove(g)}
                accessibilityRole="button"
                className="px-3 py-2 rounded-md border border-hairline active:bg-surface-4"
              >
                <Text className="font-mono text-[10px] text-primary uppercase tracking-caps-l">
                  REMOVE
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text className="font-body text-[13px] text-ink-3">
          Not a gym owner yet.
        </Text>
      )}

      <View className="gap-2">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          ADD GYM
        </Text>
        <NativeSelect
          value={pendingGymId}
          onValueChange={setPendingGymId}
          options={available}
          placeholder="Select a gym"
          title="Gyms"
          searchPlaceholder="Search gyms"
        />
        <Button onPress={handleAdd} disabled={busy || !pendingGymId}>
          {busy ? "Saving…" : "Make Gym Owner"}
        </Button>
      </View>
    </Plate>
  );
}
