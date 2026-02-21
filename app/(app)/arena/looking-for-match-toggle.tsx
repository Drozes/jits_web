"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { joinLobby, leaveLobby } from "@/hooks/use-lobby-presence";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Swords } from "lucide-react";

interface LookingForMatchToggleProps {
  athleteId: string;
  initialCasual: boolean;
  initialRanked: boolean;
}

export function LookingForMatchToggle({
  athleteId,
  initialCasual,
  initialRanked,
}: LookingForMatchToggleProps) {
  const router = useRouter();
  const [casual, setCasual] = useState(initialCasual);
  const [ranked, setRanked] = useState(initialRanked);

  const isLooking = casual || ranked;

  async function persist(nextCasual: boolean, nextRanked: boolean) {
    const supabase = createClient();
    await supabase
      .from("athletes")
      .update({ looking_for_casual: nextCasual, looking_for_ranked: nextRanked })
      .eq("id", athleteId);

    if (nextCasual || nextRanked) {
      joinLobby({
        athlete_id: athleteId,
        looking_for_casual: nextCasual,
        looking_for_ranked: nextRanked,
      });
    } else {
      leaveLobby();
    }

    router.refresh();
  }

  async function handleToggle(checked: boolean) {
    if (checked) {
      // Turning on: default to both casual and ranked
      setCasual(true);
      setRanked(true);
      await persist(true, true);
    } else {
      // Turning off: clear both
      setCasual(false);
      setRanked(false);
      await persist(false, false);
    }
  }

  async function togglePref(pref: "casual" | "ranked") {
    const nextCasual = pref === "casual" ? !casual : casual;
    const nextRanked = pref === "ranked" ? !ranked : ranked;

    // Don't allow deselecting the last preference — turn off the switch instead
    if (!nextCasual && !nextRanked) return;

    setCasual(nextCasual);
    setRanked(nextRanked);
    await persist(nextCasual, nextRanked);
  }

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all ${
        isLooking
          ? "border-green-500 bg-green-500/10 shadow-sm shadow-green-500/20"
          : "border-primary/30 bg-primary/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            isLooking ? "bg-green-500/20" : "bg-primary/10"
          }`}>
            <Swords className={`h-5 w-5 ${isLooking ? "text-green-600" : "text-primary"}`} />
          </div>
          <div>
            <h4 className="font-semibold">Looking for Match</h4>
            <p className="text-sm text-muted-foreground">
              {isLooking ? "You're visible to opponents" : "Toggle to find opponents"}
            </p>
          </div>
        </div>
        <Switch checked={isLooking} onCheckedChange={handleToggle} />
      </div>

      {isLooking && (
        <div className="mt-3 border-t border-green-500/20 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Active and visible
            </span>
          </div>
          <div className="flex gap-2">
            <Badge
              variant={casual ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => togglePref("casual")}
            >
              Casual
            </Badge>
            <Badge
              variant={ranked ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => togglePref("ranked")}
            >
              Ranked
            </Badge>
          </div>
          <div className="mt-3 space-y-1 border-t border-green-500/20 pt-2 text-xs text-muted-foreground">
            <p><span className="font-medium">Casual:</span> Practice sessions · No ELO changes</p>
            <p><span className="font-medium">Ranked:</span> Competitive matches · ELO at stake</p>
          </div>
        </div>
      )}
    </div>
  );
}
