"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { requestRandomMatch } from "@jits/shared/api/mutations";
import { Button } from "@/components/ui/button";

interface RandomMatchButtonProps {
  sessionId: string;
}

export function RandomMatchButton({ sessionId }: RandomMatchButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Find a random opponent and start a match?")) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const result = await requestRandomMatch(supabase, sessionId);

    if (result.ok) {
      router.push(`/session/${sessionId}/match/${result.data.matchId}`);
    } else {
      setError(result.error.message);
      setLoading(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" className="w-full" onClick={handleClick} disabled={loading}>
        <Shuffle className="mr-2 h-4 w-4" />
        {loading ? "Finding opponent..." : "Find Random Match"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
