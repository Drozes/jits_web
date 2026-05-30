import Link from "next/link";
import { getActiveAthlete } from "@/lib/guards";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getProfilePhotoUrl } from "@/lib/utils";
import { getInitials } from "@jits/shared/utils";

const ROW_CLASS = "flex items-center gap-3";
const ROW_STYLE = {
  padding: "var(--space-3)",
  borderTop: "1px solid var(--border-hairline)",
} as const;

/**
 * Sidebar-rail user footer. Fetches the active athlete null-safely (NEVER
 * requireAthlete; this shell must tolerate /eua and /signup where no active
 * athlete exists). Renders nothing when there is no active athlete.
 */
export async function SidebarFooter() {
  const athlete = await getActiveAthlete();
  if (!athlete) return null;

  const initials = getInitials(athlete.display_name);
  const photoUrl = getProfilePhotoUrl(athlete.profile_photo_url);

  return (
    <Link
      href="/profile"
      className={ROW_CLASS}
      style={{ ...ROW_STYLE, textDecoration: "none" }}
    >
      <Avatar className="h-8 w-8 shrink-0">
        {photoUrl && (
          <AvatarImage
            src={photoUrl}
            alt={athlete.display_name}
            className="object-cover"
          />
        )}
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div style={{ minWidth: 0 }}>
        <div
          className="font-heading font-bold truncate"
          style={{ fontSize: "var(--size-label-l)", color: "var(--text-primary)" }}
        >
          {athlete.display_name}
        </div>
        <div
          className="font-mono uppercase tabular-nums"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--text-tertiary)",
            letterSpacing: "var(--ls-caps-l)",
          }}
        >
          {athlete.current_elo} ELO
        </div>
      </div>
    </Link>
  );
}

export function SidebarFooterSkeleton() {
  return (
    <div className={`${ROW_CLASS} animate-pulse`} style={ROW_STYLE}>
      <div
        className="h-8 w-8 shrink-0 rounded-full"
        style={{ background: "var(--bg-elevated)" }}
      />
      <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
        <div
          style={{
            height: 12,
            width: 96,
            background: "var(--bg-elevated)",
            borderRadius: "var(--radius-xs)",
          }}
        />
        <div
          style={{
            height: 9,
            width: 56,
            background: "var(--bg-elevated)",
            borderRadius: "var(--radius-xs)",
          }}
        />
      </div>
    </div>
  );
}
