"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Plate } from "@/components/ui/elo-system";
import { createClient } from "@/lib/supabase/client";

interface SettingsContentProps {
  email: string;
}

export function SettingsContent({ email }: SettingsContentProps) {
  return (
    <div className="flex flex-col animate-page-in" style={{ gap: "var(--space-6)" }}>
      <AccountSection email={email} />
      <PreferencesSection />
      <SupportSection />
    </div>
  );
}

function AccountSection({ email }: { email: string }) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Plate style={{ padding: 0 }}>
      <PlateRow>
        <RowLabel>EMAIL</RowLabel>
        <RowValue>{email || "—"}</RowValue>
      </PlateRow>
      <RowDivider />
      <button
        type="button"
        onClick={handleSignOut}
        style={rowButtonStyle}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--bg-elevated-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color: "var(--accent-cta)",
            textTransform: "uppercase",
            letterSpacing: "var(--ls-caps-l)",
            lineHeight: 1.2,
          }}
        >
          SIGN OUT
        </span>
      </button>
    </Plate>
  );
}

function PreferencesSection() {
  return (
    <Plate style={{ padding: 0 }}>
      <RowLink href="/settings/notifications" label="NOTIFICATIONS" />
      <RowDivider />
      <ThemeRow />
    </Plate>
  );
}

function SupportSection() {
  return (
    <Plate style={{ padding: 0 }}>
      <RowLink href="/settings/feedback" label="FEEDBACK" />
      <RowDivider />
      <RowLink href="/settings/help" label="HELP & SUPPORT" />
      <RowDivider />
      <RowLink href="/settings/video" label="VIDEO SETTINGS" />
    </Plate>
  );
}

function ThemeRow() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const active = mounted ? theme ?? resolvedTheme ?? "system" : "system";

  return (
    <div style={{ ...rowBaseStyle, gap: "var(--space-3)" }}>
      <RowLabel>THEME</RowLabel>
      <div style={{ display: "inline-flex", gap: "var(--space-1)" }}>
        <ThemeChip active={active === "dark"} onClick={() => setTheme("dark")}>
          DARK
        </ThemeChip>
        <ThemeChip active={active === "light"} onClick={() => setTheme("light")}>
          LIGHT
        </ThemeChip>
      </div>
    </div>
  );
}

function ThemeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: "var(--size-label-s)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-xs)",
        border: `1px solid ${active ? "var(--accent-cta)" : "var(--border-hairline-strong)"}`,
        background: active ? "var(--bg-elevated-hover)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: "pointer",
        transition: "background var(--motion-hover), color var(--motion-hover), border-color var(--motion-hover)",
      }}
    >
      {children}
    </button>
  );
}

function RowLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        ...rowBaseStyle,
        textDecoration: "none",
        transition: "background var(--motion-hover)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--bg-elevated-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <RowLabel>{label}</RowLabel>
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-m)",
          color: "var(--text-tertiary)",
          lineHeight: 1,
        }}
      >
        ›
      </span>
    </Link>
  );
}

function PlateRow({ children }: { children: React.ReactNode }) {
  return <div style={rowBaseStyle}>{children}</div>;
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  );
}

function RowValue({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-s)",
        color: "var(--text-primary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
        lineHeight: 1.2,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: "60%",
      }}
    >
      {children}
    </span>
  );
}

function RowDivider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--border-hairline-faint)",
      }}
    />
  );
}

const rowBaseStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--space-3) var(--space-4)",
  background: "transparent",
};

const rowButtonStyle: React.CSSProperties = {
  ...rowBaseStyle,
  width: "100%",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background var(--motion-hover)",
};
