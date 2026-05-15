import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { EditProfileContent } from "./edit-profile-content";

export default function EditProfilePage() {
  return (
    <>
      <AppHeader title="Edit Profile" back />
      <Suspense fallback={<EditSkeleton />}>
        <EditProfileContent />
      </Suspense>
    </>
  );
}

function EditSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-md p-4 animate-pulse"
      style={{ background: "var(--bg-primary)" }}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="mb-4"
          style={{ height: 64, background: "var(--bg-elevated)" }}
        />
      ))}
    </div>
  );
}
