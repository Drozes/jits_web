import * as React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/hooks";
import { supabase } from "@/lib/supabase/client";
import { setPlatformRole } from "@jits/shared/api/mutations";
import type { AdminAthlete } from "@jits/shared/api/queries";

type PlatformRole = AdminAthlete["platform_role"];

const ROLE_OPTIONS: { role: PlatformRole; label: string }[] = [
  { role: "member", label: "MEMBER" },
  { role: "admin", label: "ADMIN" },
  { role: "founder", label: "FOUNDER" },
];

/**
 * Founder-only platform-role editor for one selected member. Non-founder admins
 * get a read-only notice (only founders can mint roles; the server enforces it
 * too). `onChanged` patches the roster so the badge + disabled state update.
 */
export function MemberRoleSection({
  member,
  isFounder,
  onChanged,
}: {
  member: AdminAthlete;
  isFounder: boolean;
  onChanged: (athleteId: string, role: PlatformRole) => void;
}) {
  const { athlete } = useAuth();
  const [targetRole, setTargetRole] = React.useState<PlatformRole>(
    member.platform_role,
  );
  const [submitting, setSubmitting] = React.useState(false);

  // Re-sync the target when the selected member (or their role) changes.
  React.useEffect(() => {
    setTargetRole(member.platform_role);
  }, [member.id, member.platform_role]);

  const handleSubmit = React.useCallback(() => {
    // Warn when a founder drops their OWN access (the server still protects the
    // last founder; distinct copy guards against an accidental self-lockout).
    const isSelfDemotion =
      member.id === athlete?.id && targetRole !== "founder";
    Alert.alert(
      isSelfDemotion ? "Remove your own access?" : "Change role",
      isSelfDemotion
        ? `You're about to remove your OWN access by setting yourself to ${targetRole.toUpperCase()}.`
        : `Set ${member.display_name} to ${targetRole.toUpperCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: targetRole === "member" ? "destructive" : "default",
          onPress: async () => {
            setSubmitting(true);
            const result = await setPlatformRole(supabase, {
              athleteId: member.id,
              role: targetRole,
            });
            setSubmitting(false);
            if (result.ok) {
              toast.success(
                `${member.display_name} is now ${targetRole.toUpperCase()}`,
              );
              onChanged(member.id, targetRole);
            } else {
              toast.error(result.error.message);
            }
          },
        },
      ],
    );
  }, [member.id, member.display_name, targetRole, athlete?.id, onChanged]);

  if (!isFounder) {
    return (
      <Plate className="gap-2">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          PLATFORM ROLE
        </Text>
        <Text className="font-body text-[13px] text-ink-2 leading-relaxed">
          Only a founder can change platform roles. You can still manage gym
          ownership below.
        </Text>
      </Plate>
    );
  }

  return (
    <Plate className="gap-4">
      <View className="gap-2">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          SET PLATFORM ROLE
        </Text>
        <View className="flex-row gap-2">
          {ROLE_OPTIONS.map(({ role, label }) => {
            const active = targetRole === role;
            return (
              <Pressable
                key={role}
                onPress={() => setTargetRole(role)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                className={`flex-1 items-center rounded-md border px-2 py-2 ${
                  active
                    ? "border-cta bg-surface-4"
                    : "border-hairline bg-transparent"
                }`}
              >
                <Text
                  className={`font-mono text-[10px] uppercase tracking-caps-l ${
                    active ? "text-ink" : "text-ink-3"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Button
        onPress={handleSubmit}
        disabled={submitting || targetRole === member.platform_role}
      >
        {submitting ? "Saving…" : "Update Role"}
      </Button>
    </Plate>
  );
}
