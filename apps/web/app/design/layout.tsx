"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

const navLinks = [
  { href: "/design", label: "Overview" },
  { href: "/design/style-guide", label: "Style Guide" },
  { href: "/design/ui-kit", label: "UI Kit" },
  { href: "/design/screens", label: "Web Screens" },
  { href: "/design/screens/native", label: "Native Screens" },
];

export default function DesignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/design" className="font-display text-2xl uppercase leading-none text-primary">
              ELO RATED
            </Link>
            <span className="font-heading text-xs uppercase tracking-widest text-muted-foreground">
              Design System
            </span>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-sm p-2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <nav className="mx-auto max-w-6xl px-6">
          <div className="flex gap-1 overflow-x-auto">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/design"
                  ? pathname === "/design"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 font-heading text-sm uppercase tracking-wide transition-colors ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
