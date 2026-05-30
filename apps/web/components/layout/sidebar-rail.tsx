"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui/elo-system";
import { NAV_TABS, isActiveTab, isImmersiveRoute } from "./nav-config";

/**
 * Persistent left nav rail, shown only at >= lg (below lg the <BottomNavBar/>
 * takes over). Wordmark + the shared NAV_TABS links + a server-rendered user
 * footer passed in as the `footer` slot. Hidden on immersive routes.
 */
export function SidebarRail({ footer }: { footer: React.ReactNode }) {
  const pathname = usePathname();

  if (isImmersiveRoute(pathname)) return null;

  return (
    <aside
      className="hidden shrink-0 self-start lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between"
      style={{
        width: 232,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-hairline)",
        padding: "var(--space-5) var(--space-4)",
      }}
    >
      <div className="flex flex-col gap-6">
        <Wordmark size="md" />
        <nav className="flex flex-col gap-1">
          {NAV_TABS.map(({ href, label }) => {
            const active = isActiveTab(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                className="font-heading font-bold uppercase"
                style={{
                  fontSize: "var(--size-label-l)",
                  letterSpacing: "var(--ls-caps)",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-xs)",
                  borderLeft: `3px solid ${active ? "var(--accent-cta)" : "transparent"}`,
                  background: active ? "var(--bg-elevated)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none",
                  transition: "color var(--motion-hover)",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {footer}
    </aside>
  );
}
