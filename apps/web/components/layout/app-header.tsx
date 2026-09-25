"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveHeaderSignal } from "./live-header-signal";

interface AppHeaderProps {
  title: string;
  icon?: React.ReactNode;
  back?: boolean;
  rightAction?: React.ReactNode;
  className?: string;
}

export function AppHeader({
  title,
  icon,
  back = false,
  rightAction,
  className,
}: AppHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 grid h-[var(--shell-header-h)] items-center gap-3 px-4 pt-[env(safe-area-inset-top)]",
        className,
      )}
      style={{
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-hairline)",
        // Symmetric side columns keep the title centred whatever the right
        // side holds (LIVE pill, bell, share).
        gridTemplateColumns: "1fr auto 1fr",
      }}
    >
      {back ? (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="grid place-items-center justify-self-start transition-colors hover:bg-[var(--bg-elevated)]"
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
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : (
        <span style={{ width: 32, height: 32 }} />
      )}

      <h1
        className="font-heading font-bold uppercase"
        style={{
          fontSize: "var(--size-label-l)",
          color: "var(--text-secondary)",
          letterSpacing: "var(--ls-caps-l)",
          textAlign: "center",
          margin: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
        }}
      >
        {icon && <span style={{ color: "var(--accent-cta)" }}>{icon}</span>}
        {title}
      </h1>

      <div className="flex items-center justify-end gap-1" style={{ minWidth: 32 }}>
        <Suspense fallback={null}>
          <LiveHeaderSignal />
        </Suspense>
        {rightAction}
      </div>
    </header>
  );
}
