"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate, MetaTag } from "@/components/ui/elo-system";
import { cn, getProfilePhotoUrl } from "@/lib/utils";
import { getInitials } from "@jits/shared/utils";
import { X, Eye, Heart, RotateCcw } from "lucide-react";

/** Circular icon action. Like is the surface's single Signal Red CTA. */
function IconAction({
  label,
  onClick,
  href,
  primary = false,
  size = 56,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  size?: number;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    display: "grid",
    placeItems: "center",
    background: primary ? "var(--accent-cta)" : "var(--bg-elevated)",
    color: primary ? "var(--text-on-accent)" : "var(--text-secondary)",
    border: primary
      ? "1px solid transparent"
      : "1px solid var(--border-hairline-strong)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "background var(--motion-hover)",
  };

  if (href) {
    return (
      <Link href={href} aria-label={label} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

const STAMP_BASE: React.CSSProperties = {
  position: "absolute",
  top: "var(--space-6)",
  padding: "var(--space-1) var(--space-3)",
  borderRadius: "var(--radius-xs)",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  fontSize: "var(--size-label-l)",
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps-l)",
  transition: "opacity var(--motion-hover)",
};

interface Competitor {
  id: string;
  displayName: string;
  currentElo: number;
  gymName: string | null;
  weight: number | null;
  profilePhotoUrl?: string;
  wins: number;
  losses: number;
}

interface SwipeDiscoveryClientProps {
  competitors: Competitor[];
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

  return (
    <>
      <AppHeader title="Discover" back />
      <PageContainer className="pt-6">
        <div
          className="flex flex-col items-center animate-page-in"
          style={{ gap: "var(--space-6)" }}
        >
          {!isFinished && current ? (
            <>
              {/* Card stack */}
              <div className="relative w-full max-w-xs h-96">
                {currentIndex + 1 < competitors.length && (
                  <div className="absolute inset-0 scale-95 opacity-50">
                    <SwipeCard competitor={competitors[currentIndex + 1]} />
                  </div>
                )}

                <div
                  ref={cardRef}
                  className="absolute inset-0 touch-none select-none"
                  style={{
                    transform: `translateX(${dragOffset}px) rotate(${rotation}deg)`,
                    transition: isDragging
                      ? "none"
                      : "transform var(--duration-fast) var(--easing-out)",
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <SwipeCard competitor={current} />

                  <div
                    aria-hidden
                    className={cn(dragOffset < -40 ? "opacity-100" : "opacity-0")}
                    style={{
                      ...STAMP_BASE,
                      left: "var(--space-6)",
                      border: "1px solid var(--state-negative)",
                      color: "var(--state-negative)",
                    }}
                  >
                    Pass
                  </div>
                  <div
                    aria-hidden
                    className={cn(dragOffset > 40 ? "opacity-100" : "opacity-0")}
                    style={{
                      ...STAMP_BASE,
                      right: "var(--space-6)",
                      border: "1px solid var(--state-positive)",
                      color: "var(--state-positive)",
                    }}
                  >
                    Like
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div
                className="flex items-center"
                style={{ gap: "var(--space-4)" }}
              >
                <IconAction label="Pass" onClick={handlePass}>
                  <X className="h-6 w-6" />
                </IconAction>
                <IconAction
                  label={`View ${current.displayName}'s profile`}
                  href={`/athlete/${current.id}`}
                  size={44}
                >
                  <Eye className="h-5 w-5" />
                </IconAction>
                <IconAction label="Like" onClick={handleLike} primary>
                  <Heart className="h-6 w-6" />
                </IconAction>
              </div>

              {/* Progress */}
              <p
                className="font-mono"
                style={{
                  fontSize: "var(--size-num-xs)",
                  color: "var(--text-secondary)",
                  letterSpacing: "var(--ls-caps-l)",
                  fontVariantNumeric: "tabular-nums",
                  margin: 0,
                }}
              >
                {currentIndex + 1} OF {competitors.length}
              </p>
            </>
          ) : (
            /* End state */
            <Plate variant="accent" className="w-full max-w-xs">
              <div
                className="font-mono uppercase"
                style={{
                  fontSize: "var(--size-num-xs)",
                  color: "var(--text-secondary)",
                  letterSpacing: "var(--ls-caps-xl)",
                }}
              >
                All caught up
              </div>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--size-body)",
                  color: "var(--text-primary)",
                  margin: "var(--space-2) 0 var(--space-4)",
                }}
              >
                You&apos;ve reviewed {competitors.length} athletes.
              </p>

              <div
                className="grid grid-cols-2"
                style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}
              >
                <StatCell label="Liked" value={liked.length} />
                <StatCell label="Passed" value={passed.length} />
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="font-heading font-bold uppercase"
                style={{
                  width: "100%",
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                  background: "var(--accent-cta)",
                  color: "var(--text-on-accent)",
                  border: "1px solid transparent",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--size-label-l)",
                  letterSpacing: "var(--ls-caps)",
                  cursor: "pointer",
                  transition: "background var(--motion-hover)",
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Start over
              </button>
            </Plate>
          )}
        </div>
      </PageContainer>
    </>
  );
}

function StatCell({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="text-center">
      <div
        className="font-mono"
        style={{
          fontSize: "var(--size-num-l)",
          fontWeight: 700,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
        {suffix}
      </div>
      <div
        className="font-mono uppercase"
        style={{
          fontSize: "var(--size-label-xs)",
          color: "var(--text-secondary)",
          letterSpacing: "var(--ls-caps-xxl)",
          marginTop: "var(--space-1)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function SwipeCard({ competitor }: { competitor: Competitor }) {
  const total = competitor.wins + competitor.losses;
  const winRate = total > 0 ? Math.round((competitor.wins / total) * 100) : 0;
  const photo = competitor.profilePhotoUrl
    ? getProfilePhotoUrl(competitor.profilePhotoUrl)
    : null;

  return (
    <Plate
      className="h-full flex flex-col items-center justify-center"
      style={{ padding: "var(--space-6)" }}
    >
      <span
        aria-hidden
        style={{
          width: 96,
          height: 96,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-hairline-strong)",
          background: "var(--bg-elevated-hover)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          marginBottom: "var(--space-4)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-heading-l)",
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "var(--ls-caps-l)",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          getInitials(competitor.displayName)
        )}
      </span>

      <h3
        className="font-heading font-bold"
        style={{
          fontSize: "var(--size-heading-l)",
          color: "var(--text-primary)",
          margin: 0,
          lineHeight: "var(--lh-snug)",
          textAlign: "center",
        }}
      >
        {competitor.displayName}
      </h3>

      {competitor.gymName && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-s)",
            color: "var(--text-secondary)",
            margin: "var(--space-1) 0 0",
            textAlign: "center",
          }}
        >
          {competitor.gymName}
        </p>
      )}

      <div
        className="flex items-center"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-3)" }}
      >
        {competitor.weight != null && (
          <MetaTag>{competitor.weight} lbs</MetaTag>
        )}
        <MetaTag>ELO {competitor.currentElo}</MetaTag>
      </div>

      <div
        className="grid grid-cols-3 w-full"
        style={{ gap: "var(--space-4)", marginTop: "var(--space-6)" }}
      >
        <StatCell label="Wins" value={competitor.wins} />
        <StatCell label="Losses" value={competitor.losses} />
        <StatCell label="Win Rate" value={winRate} suffix="%" />
      </div>
    </Plate>
  );
}
