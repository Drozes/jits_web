import * as React from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui/toast";
import { useAuth, useIsAdmin, useIsFounder } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useAthleteSearch } from "@/lib/admin/use-athlete-search";
import { supabase } from "@/lib/supabase/client";
import { setPlatformRole } from "@jits/shared/api/mutations";
import type { AthleteSearchResult } from "@jits/shared/api/queries";

type PlatformRole = AthleteSearchResult["platform_role"];

const ROLE_OPTIONS: { role: PlatformRole; label: string }[] = [
  { role: "member", label: "MEMBER" },
  { role: "admin", label: "ADMIN" },
  { role: "founder", label: "FOUNDER" },
];

/**
 * Admin > Roles. Founder-only: search an athlete, pick a target role, confirm,
 * and call `admin_set_platform_role`. Admins who are not founders get a
 * read-only "Founders only" notice (admins cannot mint roles). Self-guards like
 * the hub.
 */
export default function AdminRolesScreen() {
  const { isLoading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const isFounder = useIsFounder();

  if (!authLoading && !isAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="Roles" back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 16 }}>
        {isFounder ? <RoleManager /> : <FoundersOnlyNotice />}
      </PageContainer>
    </>
  );
}

function FoundersOnlyNotice() {
  return (
    <Plate className="gap-2">
      <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
        FOUNDERS ONLY
      </Text>
      <Text className="font-body text-[13px] text-ink-2 leading-relaxed">
        Only a founder can change platform roles. You have admin access to view
        metrics and feature flags, but role assignment is restricted.
      </Text>
    </Plate>
  );
}

function RoleManager() {
  const tokens = useThemedTokens();
  const { athlete } = useAuth();
  const { query, setQuery, results, isSearching } = useAthleteSearch();
  const [selected, setSelected] = React.useState<AthleteSearchResult | null>(
    null,
  );
  const [targetRole, setTargetRole] = React.useState<PlatformRole>("admin");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSelect = React.useCallback((athlete: AthleteSearchResult) => {
    setSelected(athlete);
    setTargetRole(athlete.platform_role);
  }, []);

  const handleSubmit = React.useCallback(() => {
    if (!selected) return;
    // Warn when the founder is dropping their OWN admin/founder access: the
    // server still protects the last founder, but distinct copy guards against
    // an accidental self-lockout. (Promoting yourself, or any change to another
    // athlete, uses the normal copy.)
    const isSelfDemotion =
      selected.id === athlete?.id && targetRole !== "founder";
    Alert.alert(
      isSelfDemotion ? "Remove your own access?" : "Change role",
      isSelfDemotion
        ? `You're about to remove your OWN access by setting yourself to ${targetRole.toUpperCase()}.`
        : `Set ${selected.display_name} to ${targetRole.toUpperCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: targetRole === "member" ? "destructive" : "default",
          onPress: async () => {
            setSubmitting(true);
            const result = await setPlatformRole(supabase, {
              athleteId: selected.id,
              role: targetRole,
            });
            setSubmitting(false);
            if (result.ok) {
              toast.success(
                `${selected.display_name} is now ${targetRole.toUpperCase()}`,
              );
              setSelected((prev) =>
                prev ? { ...prev, platform_role: targetRole } : prev,
              );
            } else {
              toast.error(result.error.message);
            }
          },
        },
      ],
    );
  }, [selected, targetRole, athlete?.id]);

  return (
    <>
      <Input
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setSelected(null);
        }}
        placeholder="Search athletes by name"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {selected ? (
        <Plate className="gap-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 min-w-0 pr-3">
              <Text className="font-heading text-[15px] text-ink" numberOfLines={1}>
                {selected.display_name}
              </Text>
              <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-1">
                CURRENT: {selected.platform_role}
              </Text>
            </View>
            <RoleBadge role={selected.platform_role} />
          </View>

          <View className="gap-2">
            <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
              SET ROLE
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
            disabled={submitting || targetRole === selected.platform_role}
          >
            {submitting ? "Saving…" : "Update Role"}
          </Button>
        </Plate>
      ) : isSearching ? (
        <View className="items-center py-8">
          <ActivityIndicator color={tokens.textTertiary} />
        </View>
      ) : results.length > 0 ? (
        <Plate className="p-0 overflow-hidden">
          {results.map((athlete, idx) => (
            <View key={athlete.id}>
              {idx > 0 ? <View className="h-px bg-hairline-faint" /> : null}
              <Pressable
                onPress={() => handleSelect(athlete)}
                accessibilityRole="button"
                className="flex-row items-center justify-between px-4 py-3 active:bg-surface-4"
              >
                <Text
                  className="font-body text-[13px] text-ink flex-1 pr-3"
                  numberOfLines={1}
                >
                  {athlete.display_name}
                </Text>
                <RoleBadge role={athlete.platform_role} />
              </Pressable>
            </View>
          ))}
        </Plate>
      ) : query.trim().length > 0 ? (
        <Plate>
          <Text className="font-body text-[13px] text-ink-3">
            No athletes found.
          </Text>
        </Plate>
      ) : null}
    </>
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
