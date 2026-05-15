"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, Trophy, User } from "lucide-react";

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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-hairline)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div
        className="mx-auto grid w-full max-w-md"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center gap-1"
              style={{
                paddingTop: "var(--space-3)",
                paddingBottom: "var(--space-3)",
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                borderTop: `2px solid ${isActive ? "var(--accent-cta)" : "transparent"}`,
                transition: "color var(--motion-hover)",
                textDecoration: "none",
              }}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.25 : 1.75} />
              <span
                className="font-heading font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "var(--ls-caps-l)",
                  lineHeight: 1,
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
