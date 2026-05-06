"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Play, XCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import {
  activateSession,
  cancelSession,
  completeSession,
} from "@jits/shared/api/mutations";

interface SessionActionsProps {
  sessionId: string;
  status: string;
}

export function SessionActions({ sessionId, status }: SessionActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(
    action: "activate" | "cancel" | "complete",
  ) {
    setLoading(true);
    const supabase = createClient();

    const mutationMap = {
      activate: () => activateSession(supabase, sessionId),
      cancel: () => cancelSession(supabase, sessionId),
      complete: () => completeSession(supabase, sessionId),
    };

    const result = await mutationMap[action]();

    if (result.ok) {
      const labels = { activate: "Session activated", cancel: "Session cancelled", complete: "Session ended" };
      toast.success(labels[action]);
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "scheduled" && (
          <DropdownMenuItem onClick={() => handleAction("activate")}>
            <Play className="mr-2 h-4 w-4" />
            Activate
          </DropdownMenuItem>
        )}
        {status === "active" && (
          <DropdownMenuItem onClick={() => handleAction("complete")}>
            <CheckCircle className="mr-2 h-4 w-4" />
            End Session
          </DropdownMenuItem>
        )}
        {(status === "scheduled" || status === "active") && (
          <DropdownMenuItem
            onClick={() => handleAction("cancel")}
            className="text-destructive focus:text-destructive"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Cancel
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
