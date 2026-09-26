"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const PANEL_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-hairline)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-6) var(--space-4)",
  textAlign: "center",
};

const COPY = {
  "not-participant": {
    title: "You can't view this match",
    body: "Only the two athletes in a match can see its details and video.",
  },
  error: {
    title: "Couldn't load this match",
    body: "Check your connection and try again.",
  },
} as const;

/** Screen-level panels for spec 3.2 (not-found is the route's 404 page). */
export function MatchDetailErrorPanel({
  kind,
  retryHref,
}: {
  kind: keyof typeof COPY;
  retryHref: string;
}) {
  const router = useRouter();
  const copy = COPY[kind];
  return (
    <div style={{ padding: "var(--space-4) var(--space-3)" }}>
      <div role="alert" data-testid={`match-detail-${kind}`} style={PANEL_STYLE}>
        <p className="font-heading font-bold" style={{ color: "var(--text-primary)" }}>
          {copy.title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-4 flex justify-center">
          {kind === "error" ? (
            // A full navigation re-runs the server read; a client Link to the
            // same URL could serve the router cache instead.
            <Button asChild className="shadow-none rounded-[var(--radius-sm)]">
              <a href={retryHref}>Try again</a>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="shadow-none rounded-[var(--radius-sm)]"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/profile"))}
            >
              Back
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function NoVideoPlate() {
  return (
    <div data-testid="match-detail-no-video" style={PANEL_STYLE}>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        No video was recorded for this match.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Videos show up here when either athlete records the match.
      </p>
    </div>
  );
}
