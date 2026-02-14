import { Suspense } from "react";
import { BottomNavBar } from "@/components/layout/bottom-nav-bar";
import { HeaderUserButton } from "@/components/layout/header-user-button";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { NavigationProgress } from "@/components/layout/navigation-progress";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <NavigationProgress />
      <AppHeader
        title="Jits"
        rightAction={
          <Suspense>
            <HeaderUserButton />
          </Suspense>
        }
      />
      <PageContainer className="py-6">
        {children}
      </PageContainer>
      <Suspense>
        <BottomNavBar />
      </Suspense>
    </div>
  );
}
