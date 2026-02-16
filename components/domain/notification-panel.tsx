"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, ChevronRight } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils";
import type { PendingChallenge } from "@/hooks/use-pending-challenges";

interface NotificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenges: PendingChallenge[];
}

function ChallengeItem({ challenge }: { challenge: PendingChallenge }) {
  return (
    <Link
      href="/match/pending"
      className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-500/10">
        <Zap className="h-4 w-4 text-yellow-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {challenge.challengerName}
        </p>
        <p className="text-xs text-muted-foreground">
          {challenge.matchType === "ranked" ? "Ranked" : "Casual"} challenge
          {" · "}
          {formatRelativeDate(challenge.createdAt)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

export function NotificationPanel({
  open,
  onOpenChange,
  challenges,
}: NotificationPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-80 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Notifications</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col">
          {/* Challenges section */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Challenges
              {challenges.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px]"
                >
                  {challenges.length}
                </Badge>
              )}
            </div>
          </div>

          {challenges.length > 0 ? (
            <div className="flex flex-col px-1">
              {challenges.map((c) => (
                <ChallengeItem key={c.id} challenge={c} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No pending challenges
            </div>
          )}

          {challenges.length > 0 && (
            <div className="border-t px-4 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                asChild
              >
                <Link href="/match/pending">View all challenges</Link>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
