import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { SettingsContent } from "./settings-content";

export default function SettingsPage() {
  return (
    <>
      <AppHeader title="Settings" back />
      <PageContainer className="pt-6">
        <Suspense fallback={<SettingsSkeleton />}>
          <SettingsContent />
        </Suspense>
      </PageContainer>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-6 w-40 rounded bg-muted" />
      <div className="flex flex-col gap-4">
        <div className="h-14 rounded-xl bg-muted" />
        <div className="h-14 rounded-xl bg-muted" />
        <div className="h-14 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
