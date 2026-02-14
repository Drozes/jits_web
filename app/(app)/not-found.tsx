import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find what you&apos;re looking for.
      </p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
