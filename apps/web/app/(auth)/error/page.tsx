import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Access was denied. Please try signing in again.",
  server_error:
    "Something went wrong on our end. Please try again in a moment.",
  temporarily_unavailable:
    "The service is temporarily unavailable. Please try again shortly.",
  validation_failed:
    "There was a problem with your request. Please try again.",
};

const DEFAULT_MESSAGE =
  "Something unexpected happened. Please try signing in again.";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;
  const message = params?.error
    ? (ERROR_MESSAGES[params.error] ?? DEFAULT_MESSAGE)
    : DEFAULT_MESSAGE;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild className="w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Sorry, something went wrong.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense>
                <ErrorContent searchParams={searchParams} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
