import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { GymDetailContent } from "./gym-detail-content";
import { GymDetailSkeleton } from "./gym-detail-skeleton";
import { GymHeaderManageLink } from "./gym-header-manage-link";

export default function GymDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader
        title="Gym"
        back
        rightAction={
          <Suspense fallback={null}>
            <GymHeaderManageLink paramsPromise={params} />
          </Suspense>
        }
      />
      <PageContainer className="py-6">
        <Suspense fallback={<GymDetailSkeleton />}>
          <GymDetailContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}
