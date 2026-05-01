"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rsvpToSession, cancelRsvp } from "@jits/shared/api/mutations";
import { toast } from "sonner";

interface RsvpButtonProps {
  sessionId: string;
  isRsvpd: boolean;
}

export function RsvpButton({ sessionId, isRsvpd: initialRsvpd }: RsvpButtonProps) {
  const [rsvpd, setRsvpd] = useState(initialRsvpd);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();

    if (rsvpd) {
      const result = await cancelRsvp(supabase, sessionId);
      if (result.ok) setRsvpd(false);
      else toast.error(result.error.message);
    } else {
      const result = await rsvpToSession(supabase, sessionId);
      if (result.ok) setRsvpd(true);
      else toast.error(result.error.message);
    }

    setLoading(false);
  }

  return (
    <Button
      size="sm"
      variant={rsvpd ? "outline" : "secondary"}
      className="w-full"
      onClick={handleClick}
      disabled={loading}
    >
      {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
      {rsvpd ? "Cancel RSVP" : "RSVP"}
    </Button>
  );
}
