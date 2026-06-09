import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Link, Redirect, type Href } from "expo-router";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";

/**
 * Admin hub. Lists the platform-admin sub-screens (roles, metrics, feature
 * flags). Self-guards: any non-admin (or signed-out) athlete is bounced to the
 * root redirector, mirroring the <Redirect> approach in app/index.tsx. Section
 * visibility in settings/index.tsx already hides the entry point, this guard is
 * the defense-in-depth for a deep link straight to /settings/admin.
 */

type AdminRoute =
  | "/settings/admin/members"
  | "/settings/admin/metrics"
  | "/settings/admin/flags";

const ADMIN_LINKS: { href: AdminRoute; label: string }[] = [
  { href: "/settings/admin/members", label: "MEMBERS" },
  { href: "/settings/admin/metrics", label: "METRICS" },
  { href: "/settings/admin/flags", label: "FEATURE FLAGS" },
];

export default function AdminScreen() {
  const { isLoading } = useAuth();
  const isAdmin = useIsAdmin();

  if (!isLoading && !isAdmin) return <Redirect href="/" />;

  return (
    <>
      <AppHeader title="Admin" back />
      <PageContainer noTabBar contentContainerStyle={{ paddingTop: 24, gap: 24 }}>
        <Plate className="p-0 overflow-hidden">
          {ADMIN_LINKS.map(({ href, label }, idx) => (
            <View key={href}>
              {idx > 0 ? <RowDivider /> : null}
              <AdminRow href={href} label={label} />
            </View>
          ))}
        </Plate>
      </PageContainer>
    </>
  );
}

function AdminRow({ href, label }: { href: AdminRoute; label: string }) {
  return (
    <Link href={href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        className="flex-row items-center justify-between px-4 py-3 min-h-11 active:bg-surface-4"
      >
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l">
          {label}
        </Text>
        <Text
          className="font-mono text-[14px] text-ink-3"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {"›"}
        </Text>
      </Pressable>
    </Link>
  );
}

function RowDivider() {
  return <View className="h-px bg-hairline-faint" />;
}
