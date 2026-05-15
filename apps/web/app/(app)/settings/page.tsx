import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { SettingsContent } from "./settings-content";
import { requireAuth } from "@/lib/guards";

export default async function SettingsPage() {
  await requireAuth();
  return (
    <>
      <AppHeader title="Settings" back />
      <PageContainer className="pt-6">
        <Suspense fallback={<SettingsSkeleton />}>
          <SettingsData />
        </Suspense>
      </PageContainer>
    </>
  );
}

async function SettingsData() {
  const user = await requireAuth();
  return <SettingsContent email={user.email ?? ""} />;
}

function SettingsSkeleton() {
  return (
    <div
      className="flex flex-col animate-pulse"
      style={{ gap: "var(--space-6)" }}
    >
      <div
        style={{
          height: 120,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
        }}
      />
      <div
        style={{
          height: 120,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
        }}
      />
      <div
        style={{
          height: 120,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
        }}
      />
    </div>
  );
}
