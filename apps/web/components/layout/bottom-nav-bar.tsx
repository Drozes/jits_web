"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/gyms", label: "Gyms", icon: MapPin },
  { href: "/leaderboard", label: "Rankings", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
] as const;

// Hide the nav bar on immersive routes (match flow, lobby, join wizard, setup)
const HIDE_PATTERNS = [
  /^\/session\/[^/]+\/match\//,
  /^\/session\/[^/]+\/lobby/,
  /^\/session\/[^/]+\/join/,
  /^\/match\/[^/]+\/live/,
  /^\/match\/[^/]+\/results/,
  /^\/profile\/setup/,
];

export function BottomNavBar() {
  const pathname = usePathname();

  if (HIDE_PATTERNS.some((p) => p.test(pathname))) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto mb-2 flex h-16 max-w-md items-center justify-around rounded-2xl border border-border/50 bg-card/90 shadow-lg backdrop-blur-xl">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-medium transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                  isActive && "bg-primary/10",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] transition-all duration-200", isActive && "stroke-[2.5] scale-110")} />
              </div>
              <span className={cn("transition-all duration-200", isActive && "font-semibold")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
