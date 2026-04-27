"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TOS_TEXT } from "@jits/shared/utils";

interface TosStepProps {
  onAccept: () => void | Promise<void>;
}

export function TosStep({ onAccept }: TosStepProps) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    setSubmitting(true);
    await onAccept();
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-4 max-h-[50vh] overflow-y-auto">
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">
          {TOS_TEXT}
        </pre>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
        />
        <span className="text-sm">
          I have read and agree to the Terms of Service
        </span>
      </label>

      <Button
        onClick={handleContinue}
        disabled={!agreed || submitting}
      >
        {submitting ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}
