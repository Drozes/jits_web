"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rsvpToSession, cancelRsvp } from "@jits/shared/api/mutations";

interface GymRsvpActionProps {
  sessionId: string;
  isRsvpd: boolean;
}

export function GymRsvpAction({ sessionId, isRsvpd: initial }: GymRsvpActionProps) {
  const router = useRouter();
  const [rsvpd, setRsvpd] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    const supabase = createClient();
    const result = rsvpd
      ? await cancelRsvp(supabase, sessionId)
      : await rsvpToSession(supabase, sessionId);

    if (result.ok) {
      setRsvpd(!rsvpd);
      startTransition(() => router.refresh());
    } else {
      toast.error(result.error.message);
    }
    setLoading(false);
  }

  const isGoing = rsvpd;
  const styleShared: React.CSSProperties = {
    fontFamily: "var(--font-heading)",
    fontSize: "var(--size-label-s)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "var(--ls-caps)",
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-xs)",
    border: "1px solid",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    whiteSpace: "nowrap",
    minWidth: 88,
    justifyContent: "center",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      style={{
        ...styleShared,
        background: isGoing ? "var(--accent-cta)" : "var(--bg-elevated)",
        color: isGoing ? "var(--text-on-accent)" : "var(--text-secondary)",
        borderColor: isGoing ? "var(--accent-cta)" : "var(--border-hairline-strong)",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isGoing ? (
        <>✓ Going</>
      ) : (
        <>Attend</>
      )}
    </button>
  );
}
