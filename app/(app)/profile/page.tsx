import { Suspense } from "react";
import { ProfileContent } from "./profile-content";

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-9 w-24 rounded bg-muted" />
        <div className="h-9 w-20 rounded bg-muted" />
      </div>
      <div className="space-y-6">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 rounded-lg bg-muted" />
          <div className="h-24 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
