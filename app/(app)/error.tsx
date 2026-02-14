"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <AppHeader title="Error" />
      <PageContainer className="py-6">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load this page. Please try again.
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </PageContainer>
    </>
  );
}
