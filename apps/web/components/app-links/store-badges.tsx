import type { CSSProperties } from "react";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/app-links";

export type Store = "app_store" | "play_store";

interface StoreBadgesProps {
  /** `md` (default) is 48px tall, `sm` 40px: Apple's on-screen minimum. */
  size?: "md" | "sm";
  /** Optional caps label above the badges, e.g. "Get the app". */
  heading?: string;
  align?: "start" | "center";
  /** Fires on a tap of a LIVE badge (invite landing beacons). */
  onBadgeClick?: (store: Store) => void;
  /** Overrides for tests and previews; default to the env-driven listings. */
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
}

/** Visible badge height in px. Apple: never under 40px on screen. */
const HEIGHT = { md: 48, sm: 40 } as const;

// Official artwork, unmodified (public/badges/). Apple's SVG is 119.66 x 40
// with no padding. Google's PNG is 646 x 250 with the badge itself at
// 564 x 168 and 41px of built-in padding, so it is drawn larger and pulled in
// by that padding until the two visible badges are the same height.
const APPLE = { src: "/badges/app-store-badge-en-us.svg", ratio: 119.66407 / 40 };
const GOOGLE = { src: "/badges/google-play-badge-en-us.png", w: 646, h: 250, visW: 564, visH: 168, pad: 41 };

/**
 * Official "Download on the App Store" and "Get it on Google Play" badges.
 * A store without a live listing renders a dimmed, non-interactive badge
 * with a "Coming soon" label instead of a link, so the page never sends
 * anyone to a listing that does not exist. Server-safe (no hooks).
 */
export function StoreBadges({
  size = "md",
  heading,
  align = "start",
  onBadgeClick,
  appStoreUrl = APP_STORE_URL,
  playStoreUrl = PLAY_STORE_URL,
}: StoreBadgesProps) {
  const h = HEIGHT[size];
  // Apple's minimum clear space is a quarter of the badge height.
  const space = h / 4;
  const justify = align === "center" ? "center" : "flex-start";
  return (
    <div data-testid="store-badges" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: justify }}>
      {heading && <p style={{ ...CAPS_LABEL, margin: 0 }}>{heading}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: space, justifyContent: justify }}>
        <Badge
          url={appStoreUrl}
          liveName="Download ELO RATED on the App Store"
          soonName="App Store: coming soon"
          space={space}
          onClick={onBadgeClick && (() => onBadgeClick("app_store"))}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={APPLE.src} alt="" width={Math.round(h * APPLE.ratio)} height={h} style={{ display: "block", height: h, width: h * APPLE.ratio }} />
        </Badge>
        <Badge
          url={playStoreUrl}
          liveName="Get ELO RATED on Google Play"
          soonName="Google Play: coming soon"
          space={space}
          onClick={onBadgeClick && (() => onBadgeClick("play_store"))}
        >
          <GooglePlayArt h={h} />
        </Badge>
      </div>
    </div>
  );
}

function GooglePlayArt({ h }: { h: number }) {
  const scale = h / GOOGLE.visH;
  return (
    <span style={{ display: "block", overflow: "hidden", width: GOOGLE.visW * scale, height: h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={GOOGLE.src}
        alt=""
        width={Math.round(GOOGLE.w * scale)}
        height={Math.round(GOOGLE.h * scale)}
        style={{ display: "block", maxWidth: "none", width: GOOGLE.w * scale, height: GOOGLE.h * scale, margin: -GOOGLE.pad * scale }}
      />
    </span>
  );
}

interface BadgeProps {
  url: string | null;
  liveName: string;
  soonName: string;
  space: number;
  onClick?: () => void;
  children: React.ReactNode;
}

function Badge({ url, liveName, soonName, space, onClick, children }: BadgeProps) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={liveName} onClick={onClick} style={{ display: "block", borderRadius: "var(--radius-sm)" }}>
        {children}
      </a>
    );
  }
  return (
    <div role="group" aria-label={soonName} aria-disabled="true" data-store-state="coming-soon" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: space / 2 }}>
      <span style={{ display: "block", opacity: "var(--opacity-disabled)" }}>{children}</span>
      <span aria-hidden="true" style={CAPS_LABEL}>Coming soon</span>
    </div>
  );
}

const CAPS_LABEL: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--size-num-xs)",
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps-l)",
  lineHeight: 1.2,
};
