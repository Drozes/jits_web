import Link from "next/link";
import { CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SessionUnavailableProps {
  reason?: "not-found" | "ended";
}

export function SessionUnavailable({ reason = "not-found" }: SessionUnavailableProps) {
  const title = reason === "ended" ? "Session Ended" : "This session isn't available";
  const body =
    reason === "ended"
      ? "This session is no longer active."
      : "It may have ended or been cancelled.";

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <CalendarX className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Button asChild>
        <Link href="/gyms">Back to gyms</Link>
      </Button>
    </div>
  );
}
