"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createSession } from "@/lib/api/mutations";

interface StartSessionButtonProps {
  gymId: string;
}

export function StartSessionButton({ gymId }: StartSessionButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const result = await createSession(supabase, gymId);

    if (result.ok) {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <Button onClick={handleClick} disabled={loading} className="w-full">
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Plus className="mr-2 h-4 w-4" />
      )}
      Start Session
    </Button>
  );
}
