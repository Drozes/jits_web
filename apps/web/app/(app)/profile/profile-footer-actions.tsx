"use client";

import Link from "next/link";
import { ShareProfileSheet } from "@/components/domain/share-profile-sheet";

interface ProfileFooterActionsProps {
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

/**
 * G1 footer CTA bar.
 * Per spec: full-width "Share My Number" primary button on bg-secondary panel.
 * Secondary row: Edit Profile link.
 */
export function ProfileFooterActions({ athlete }: ProfileFooterActionsProps) {
  return (
    <div
      className="grid gap-2"
      style={{
        padding: "var(--space-4) var(--space-5)",
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-hairline-strong)",
      }}
    >
      <ShareProfileSheet athlete={athlete}>
        <button
          type="button"
          className="font-heading uppercase"
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "var(--size-label-l)",
            letterSpacing: "var(--ls-caps)",
            padding: "var(--space-4) var(--space-5)",
            background: "var(--accent-cta)",
            color: "var(--text-on-accent)",
            border: "1px solid transparent",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-3)",
            width: "100%",
          }}
        >
          Share My Number →
        </button>
      </ShareProfileSheet>
      <Link
        href="/profile/edit"
        className="font-heading uppercase"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          padding: "var(--space-3) var(--space-5)",
          background: "transparent",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-hairline-strong)",
          borderRadius: "var(--radius-sm)",
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        Edit Profile
      </Link>
    </div>
  );
}
