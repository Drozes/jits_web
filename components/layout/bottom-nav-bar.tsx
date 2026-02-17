"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, Search, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/use-unread-count";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/leaderboard", label: "Rankings", icon: Trophy },
  { href: "/arena", label: "Arena", icon: Search },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: User },
] as const;

// Hide the nav bar when inside a conversation thread
const HIDE_PATTERNS = [/^\/messages\/[^/]+$/];

export function BottomNavBar() {
  const pathname = usePathname();
  const totalUnread = useUnreadCount();

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
              {href === "/messages" && totalUnread > 0 && (
                <span className="absolute top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              <span className={cn("transition-all duration-200", isActive && "font-semibold")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
