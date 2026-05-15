import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { ManageContent } from "./manage-content";
import { GymDetailSkeleton } from "../gym-detail-skeleton";

export default function GymManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <AppHeader title="Manage Gym" back />
      <PageContainer className="py-6">
        <Suspense fallback={<GymDetailSkeleton />}>
          <ManageContent paramsPromise={params} />
        </Suspense>
      </PageContainer>
    </>
  );
}
