"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EloBadge } from "@/components/domain/elo-badge";
import { Share2, Copy, Check, Info } from "lucide-react";

interface ShareProfileSheetProps {
  athleteId: string;
  displayName: string;
  elo: number;
  wins: number;
  losses: number;
  weight: number | null;
  gymName?: string | null;
  children: React.ReactNode;
}

export function ShareProfileSheet({
  athleteId,
  displayName,
  elo,
  wins,
  losses,
  weight,
  gymName,
  children,
}: ShareProfileSheetProps) {
  const [copied, setCopied] = useState(false);
  const profileUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/athlete/${athleteId}`
      : `/athlete/${athleteId}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleNativeShare() {
    if (navigator.share) {
      await navigator.share({
        title: `${displayName} on Jits`,
        text: `Check out ${displayName}'s profile on Jits`,
        url: profileUrl,
      });
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Share Profile</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 pt-4">
          {/* Profile preview card */}
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-4 text-center">
              <h3 className="text-lg font-bold">{displayName}</h3>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">ELO</span>
                <EloBadge elo={elo} variant="compact" />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {wins}W - {losses}L
                {weight != null && ` · ${weight} lbs`}
              </p>
              {gymName && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gymName}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Share actions */}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="mr-2 h-4 w-4 text-green-500" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button className="flex-1" onClick={handleNativeShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            )}
          </div>

          {/* Privacy notice */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>
              Shared profiles show your display name, ELO rating, and win/loss
              record. No personal information is included.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
