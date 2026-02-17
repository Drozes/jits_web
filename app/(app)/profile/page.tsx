import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { ProfileContent } from "./profile-content";

export default function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  return (
    <>
      <AppHeader title="Profile" rightAction={<PageHeaderActions />} />
      <PageContainer className="pt-6">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileContent searchParams={searchParams} />
        </Suspense>
      </PageContainer>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-32 rounded bg-muted" />
      <div className="h-48 rounded-lg bg-muted" />
      <div className="h-10 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
      </div>
      <div className="h-32 rounded-lg bg-muted" />
    </div>
  );
}
