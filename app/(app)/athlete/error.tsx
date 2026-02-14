"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";

export default function AthleteError({
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
      <AppHeader title="Athlete" back />
      <PageContainer className="py-6">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <h1 className="text-xl font-bold">Couldn&apos;t load profile</h1>
          <p className="text-sm text-muted-foreground">
            This athlete&apos;s profile couldn&apos;t be loaded right now.
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </PageContainer>
    </>
  );
}
