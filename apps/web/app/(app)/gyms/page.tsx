import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { GymsContent } from "./gyms-content";
import { GymsListSkeleton } from "./gyms-list-skeleton";

export default function GymsPage() {
  return (
    <>
      <AppHeader title="Gym Finder" back />
      <PageContainer className="pt-6">
        <Suspense fallback={<GymsListSkeleton />}>
          <GymsContent />
        </Suspense>
      </PageContainer>
    </>
  );
}
