"use client";

import { useState } from "react";
import {
  Gem,
  Video,
  Trophy,
  BarChart3,
  Users,
  Brain,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const PREMIUM_FEATURES = [
  {
    icon: Video,
    title: "Video Analysis",
    description: "Record matches right from the app, then review with frame-by-frame playback and annotations.",
  },
  {
    icon: Trophy,
    title: "ELO Tournaments",
    description: "Bracket-style ELO competitions — climb the ranks in organized events, not just open mats.",
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description: "Submission heatmaps, win-rate trends, and opponent tendency breakdowns.",
  },
  {
    icon: Users,
    title: "Gym Leaderboards",
    description: "Private team rankings and inter-gym challenge events.",
  },
  {
    icon: Brain,
    title: "AI Match Insights",
    description: "Smart opponent recommendations based on your style and skill gaps.",
  },
];

export function PremiumButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Premium features"
      >
        <Gem className="h-5 w-5 text-gold" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Gem className="h-5 w-5 text-gold" />
              <DialogTitle>Premium — Coming Soon</DialogTitle>
            </div>
            <DialogDescription>
              We&apos;re building the ultimate toolkit for competitive grapplers.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {PREMIUM_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-3"
              >
                <div className="mt-0.5 rounded-md bg-gold/10 p-1.5">
                  <feature.icon className="h-4 w-4 text-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-3 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span>Stay tuned — early supporters get first access.</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
