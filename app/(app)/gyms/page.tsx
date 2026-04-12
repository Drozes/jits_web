import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeaderActions } from "@/components/layout/page-header-actions";
import { GymsContent } from "./gyms-content";
import { GymsListSkeleton } from "./gyms-list-skeleton";

export default function GymsPage() {
  return (
    <>
      <AppHeader
        title="Gyms"
        icon={<MapPin className="h-5 w-5" />}
        rightAction={<PageHeaderActions />}
      />
      <PageContainer className="pt-6">
        <Suspense fallback={<GymsListSkeleton />}>
          <GymsContent />
        </Suspense>
      </PageContainer>
    </>
  );
}
