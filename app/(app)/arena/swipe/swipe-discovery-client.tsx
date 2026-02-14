"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { EloBadge } from "@/components/domain/elo-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { X, Eye, Heart, Trophy, RotateCcw } from "lucide-react";

interface Competitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName: string | null;
  wins: number;
  losses: number;
}

interface SwipeDiscoveryClientProps {
  competitors: Competitor[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function SwipeDiscoveryClient({
  competitors,
}: SwipeDiscoveryClientProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [passed, setPassed] = useState<string[]>([]);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = competitors[currentIndex];
  const isFinished = currentIndex >= competitors.length;

  const advance = useCallback(() => {
    setDragOffset(0);
    setCurrentIndex((i) => i + 1);
  }, []);

  function handlePass() {
    if (current) {
      setPassed((p) => [...p, current.id]);
      advance();
    }
  }

  function handleLike() {
    if (current) {
      setLiked((l) => [...l, current.id]);
      advance();
    }
  }

  function handleReset() {
    setCurrentIndex(0);
    setLiked([]);
    setPassed([]);
  }

  // Pointer-based drag handlers
  function handlePointerDown(e: React.PointerEvent) {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    setDragOffset(e.clientX - dragStartX.current);
  }

  function handlePointerUp() {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 100;
    if (dragOffset > threshold) {
      handleLike();
    } else if (dragOffset < -threshold) {
      handlePass();
    } else {
      setDragOffset(0);
    }
  }

  const rotation = dragOffset * 0.1;
  const opacity = Math.max(0, 1 - Math.abs(dragOffset) / 300);

  return (
    <>
      <AppHeader title="Discover" back />
      <PageContainer className="pt-6">
        <div className="flex flex-col items-center gap-6">
          {!isFinished && current ? (
            <>
              {/* Card stack */}
              <div className="relative w-full max-w-xs h-96">
                {/* Next card peek */}
                {currentIndex + 1 < competitors.length && (
                  <div className="absolute inset-0 scale-95 opacity-50">
                    <SwipeCard
                      competitor={competitors[currentIndex + 1]}
                      className="shadow-md"
                    />
                  </div>
                )}

                {/* Current card */}
                <div
                  ref={cardRef}
                  className="absolute inset-0 touch-none select-none"
                  style={{
                    transform: `translateX(${dragOffset}px) rotate(${rotation}deg)`,
                    transition: isDragging ? "none" : "transform 0.3s ease",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <SwipeCard competitor={current} className="shadow-xl" />

                  {/* Swipe indicators */}
                  <div
                    className={cn(
                      "absolute top-6 left-6 rounded-lg border-2 border-red-500 px-3 py-1 text-red-500 font-bold text-lg -rotate-12 transition-opacity",
                      dragOffset < -40 ? "opacity-100" : "opacity-0",
                    )}
                  >
                    PASS
                  </div>
                  <div
                    className={cn(
                      "absolute top-6 right-6 rounded-lg border-2 border-green-500 px-3 py-1 text-green-500 font-bold text-lg rotate-12 transition-opacity",
                      dragOffset > 40 ? "opacity-100" : "opacity-0",
                    )}
                  >
                    LIKE
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-14 w-14 rounded-full border-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                  onClick={handlePass}
                >
                  <X className="h-6 w-6" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  asChild
                >
                  <Link href={`/athlete/${current.id}`}>
                    <Eye className="h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-14 w-14 rounded-full border-2 border-green-500/50 text-green-500 hover:bg-green-500/10"
                  onClick={handleLike}
                >
                  <Heart className="h-6 w-6" />
                </Button>
              </div>

              {/* Progress */}
              <p className="text-xs text-muted-foreground">
                {currentIndex + 1} of {competitors.length}
              </p>
            </>
          ) : (
            /* End state */
            <Card className="w-full max-w-xs">
              <CardContent className="p-6 text-center">
                <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
                <h2 className="text-lg font-bold mb-2">All caught up!</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  You&apos;ve reviewed {competitors.length} athletes
                </p>
                <div className="flex justify-center gap-6 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">
                      {liked.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Liked</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">
                      {passed.length}
                    </p>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={handleReset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Start Over
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>
    </>
  );
}

function SwipeCard({
  competitor,
  className,
}: {
  competitor: Competitor;
  className?: string;
}) {
  const total = competitor.wins + competitor.losses;
  const winRate = total > 0 ? Math.round((competitor.wins / total) * 100) : 0;

  return (
    <Card
      className={cn(
        "h-full flex flex-col items-center justify-center p-6",
        className,
      )}
    >
      <Avatar className="h-24 w-24 bg-gradient-to-br from-primary to-red-600 text-white border-2 border-muted shadow-md mb-4">
        <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-red-600 text-white">
          {getInitials(competitor.displayName)}
        </AvatarFallback>
      </Avatar>

      <h3 className="text-xl font-bold">{competitor.displayName}</h3>

      {competitor.gymName && (
        <p className="text-sm text-muted-foreground mt-0.5">
          {competitor.gymName}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <span className="text-sm text-muted-foreground">ELO</span>
        <EloBadge elo={competitor.currentElo} variant="compact" />
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6 text-center w-full">
        <div>
          <p className="text-lg font-bold text-green-500 tabular-nums">
            {competitor.wins}
          </p>
          <p className="text-xs text-muted-foreground">Wins</p>
        </div>
        <div>
          <p className="text-lg font-bold text-red-500 tabular-nums">
            {competitor.losses}
          </p>
          <p className="text-xs text-muted-foreground">Losses</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums">{winRate}%</p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
      </div>
    </Card>
  );
}
