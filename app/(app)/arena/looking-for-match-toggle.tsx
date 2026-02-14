"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2 } from "lucide-react";

interface LookingForMatchToggleProps {
  athleteId: string;
  initialLooking: boolean;
}

export function LookingForMatchToggle({
  athleteId,
  initialLooking,
}: LookingForMatchToggleProps) {
  const router = useRouter();
  const [isLooking, setIsLooking] = useState(initialLooking);
  const [matchPrefs, setMatchPrefs] = useState<string[]>(["Casual"]);

  function togglePref(pref: string) {
    setMatchPrefs((prev) => {
      if (prev.includes(pref)) {
        return prev.length > 1 ? prev.filter((p) => p !== pref) : prev;
      }
      return [...prev, pref];
    });
  }

  async function handleToggle(checked: boolean) {
    setIsLooking(checked);
    const supabase = createClient();
    await supabase
      .from("athletes")
      .update({ looking_for_match: checked })
      .eq("id", athleteId);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold uppercase tracking-wide">
            Looking for Match
          </h4>
          <p className="text-sm text-muted-foreground">
            Let others know you&apos;re ready to compete
          </p>
        </div>
        <Switch checked={isLooking} onCheckedChange={handleToggle} />
      </div>

      {isLooking && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-700">
              You&apos;re visible to potential opponents
            </span>
          </div>
          <div className="flex gap-2">
            <Badge
              variant={matchPrefs.includes("Casual") ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => togglePref("Casual")}
            >
              Casual
            </Badge>
            <Badge
              variant={matchPrefs.includes("Ranked") ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => togglePref("Ranked")}
            >
              Ranked
            </Badge>
          </div>
          <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
            <p><span className="font-medium">Casual:</span> Practice sessions · No ELO changes</p>
            <p><span className="font-medium">Ranked:</span> Competitive matches · ELO at stake</p>
          </div>
        </div>
      )}
    </Card>
  );
}
