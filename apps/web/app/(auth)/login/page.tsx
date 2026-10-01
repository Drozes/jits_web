import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { safeNextParam } from "@/lib/auth/safe-next-path";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<LoginForm />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeNextParam(typeof next === "string" ? next : null)} />;
}
