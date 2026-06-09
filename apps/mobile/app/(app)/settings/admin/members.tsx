import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Plate } from "@/components/ui/elo-system";
import { NativeSelect } from "@/components/ui/native-select";
import { MemberRoleSection } from "@/components/admin/member-role-section";
import { MemberGymOwnerSection } from "@/components/admin/member-gym-owner-section";
import { useAuth, useIsAdmin, useIsFounder } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAdminMembers } from "@/lib/admin/use-admin-members";
import type { AdminAthlete } from "@jits/shared/api/queries";

type PlatformRole = AdminAthlete["platform_role"];

/**
 * Admin > Members. Browse the FULL member roster via the gym/city-style
 * autocomplete, then manage one member: founders set the platform role; any
 * admin grants / revokes gym-owner (gym_managers) status at any gym. Self-guards
 * like the hub; the platform-role section is founder-only (admins see a notice).
 */
export default function AdminMembersScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();

  if (!authLoading && !isAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="Members" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 16 }}
      >
        <MembersManager />
      </PageContainer>
    </>
  );
}

function MembersManager() {
  const tokens = useThemedTokens();
  const isFounder = useIsFounder();
  const { members, gyms, isLoading, patchRole } = useAdminMembers();
  const [selectedId, setSelectedId] = React.useState("");

  const memberOptions = React.useMemo(
    () =>
      members.map((m) => ({
        label: m.primary_gym_name
          ? `${m.display_name} — ${m.primary_gym_name}`
          : m.display_name,
        value: m.id,
      })),
    [members],
  );
  const selected = React.useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId],
  );

  if (isLoading) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator color={tokens.textTertiary} />
      </View>
    );
  }

  return (
    <>
      <View className="gap-2">
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          SELECT MEMBER ({members.length})
        </Text>
        <NativeSelect
          value={selectedId}
          onValueChange={setSelectedId}
          options={memberOptions}
          placeholder="Search members by name"
          title="Members"
          searchPlaceholder="Search members"
        />
      </View>

      {selected ? (
        <>
          <MemberHeader member={selected} />
          <MemberRoleSection
            member={selected}
            isFounder={isFounder}
            onChanged={patchRole}
          />
          <MemberGymOwnerSection member={selected} gyms={gyms} />
        </>
      ) : null}
    </>
  );
}

function MemberHeader({ member }: { member: AdminAthlete }) {
  return (
    <Plate className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text
          className="font-heading text-[15px] text-ink flex-1 pr-3"
          numberOfLines={1}
        >
          {member.display_name}
        </Text>
        <RoleBadge role={member.platform_role} />
      </View>
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        {member.primary_gym_name
          ? `GYM: ${member.primary_gym_name}`
          : "NO PRIMARY GYM"}
      </Text>
    </Plate>
  );
}

function RoleBadge({ role }: { role: PlatformRole }) {
  if (role === "member") {
    return <Badge variant="outline">MEMBER</Badge>;
  }
  return (
    <Badge variant={role === "founder" ? "default" : "secondary"}>
      {role.toUpperCase()}
    </Badge>
  );
}
