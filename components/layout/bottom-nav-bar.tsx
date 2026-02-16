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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              {href === "/messages" && totalUnread > 0 && (
                <span className="absolute -top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
