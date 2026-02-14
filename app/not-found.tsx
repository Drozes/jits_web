import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-sm text-muted-foreground mb-6">
          This page doesn&apos;t exist.
        </p>
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
