"use client";

import { Share2 } from "lucide-react";
import { ShareProfileSheet } from "@/components/domain/share-profile-sheet";

interface HeaderShareButtonProps {
  athlete: {
    id: string;
    displayName: string;
    elo: number;
    wins: number;
    losses: number;
    weight: number | null;
    gymName?: string | null;
  };
}

/** 32x32 icon button per G1 spec; opens ShareProfileSheet. */
export function HeaderShareButton({ athlete }: HeaderShareButtonProps) {
  return (
    <ShareProfileSheet athlete={athlete}>
      <button
        type="button"
        aria-label="Share"
        className="grid place-items-center transition-colors hover:bg-[var(--bg-elevated)]"
        style={{
          width: 32,
          height: 32,
          background: "transparent",
          border: "1px solid transparent",
          borderRadius: "var(--radius-xs)",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <Share2 className="h-4 w-4" />
      </button>
    </ShareProfileSheet>
  );
}
