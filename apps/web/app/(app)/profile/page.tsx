import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { ProfileContent } from "./profile-content";

export default function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  return (
    <Suspense fallback={<ProfileShell />}>
      <ProfileContent searchParams={searchParams} />
    </Suspense>
  );
}

function ProfileShell() {
  return (
    <>
      <AppHeader title="Profile" />
      <div className="flex flex-col animate-pulse">
        <div style={{ height: 240, background: "var(--bg-elevated)" }} />
        <div
          className="grid grid-cols-4"
          style={{
            gap: 1,
            background: "var(--border-hairline)",
            borderBottom: "1px solid var(--border-hairline)",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ height: 64, background: "var(--bg-elevated)" }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
