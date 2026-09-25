import { Suspense } from "react";
import { Wordmark } from "@/components/ui/elo-system";
import { PageHeaderActions } from "./page-header-actions";
import { LiveHeaderSignal } from "./live-header-signal";

/** Home's brand header: wordmark left; LIVE signal, actions and avatar right. */
export function DashboardHeaderShell({ avatar }: { avatar: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-40 flex h-[var(--shell-header-h)] items-center justify-between px-4 pt-[env(safe-area-inset-top)]"
      style={{
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <Wordmark size="md" />
      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
        <Suspense fallback={null}>
          <LiveHeaderSignal />
        </Suspense>
        <PageHeaderActions />
        {avatar}
      </div>
    </header>
  );
}
