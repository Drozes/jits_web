"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { acceptSessionWaiver } from "@/lib/api/mutations";

const WAIVER_TEXT =
  "By using the JITS platform to arrange and participate in Brazilian Jiu-Jitsu matches, " +
  "you acknowledge and accept the inherent risks of grappling, including but not limited to " +
  "physical injury. You agree to hold the JITS platform, its creators, and operators harmless " +
  "from any claims arising from your participation. This waiver does not replace any waiver " +
  "required by your training facility.\n\n" +
  "You confirm that you are in adequate physical condition to participate in grappling activities " +
  "and that you have not been advised by a medical professional to refrain from such activities. " +
  "You understand that it is your responsibility to maintain appropriate health and sports insurance.";

interface WaiverStepProps {
  sessionId: string;
  waiverId: string;
  onNext: () => void;
}

export function WaiverStep({ sessionId, waiverId, onNext }: WaiverStepProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const result = await acceptSessionWaiver(supabase, { sessionId, waiverId });
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-center text-lg font-semibold">Liability Waiver</h2>
      <div className="max-h-48 overflow-y-auto rounded-xl border p-4 text-sm text-muted-foreground">
        {WAIVER_TEXT}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        I have read and agree to this waiver
      </label>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button
        onClick={handleAccept}
        disabled={!agreed || loading}
        className="w-full rounded-xl"
      >
        {loading ? "Accepting..." : "Continue"}
      </Button>
    </div>
  );
}
