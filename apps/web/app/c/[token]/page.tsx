import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { InviteLanding } from "@/components/invites/invite-landing";
import { invitePageTitle } from "@/lib/invites/format";
import { getInvitePreviewCached as getInvitePreview } from "@/lib/invites/preview";
import { publicSiteOrigin } from "@/lib/invites/site-origin";
import { detectInAppBrowser } from "@/lib/invites/user-agent";
import { getInviteViewer } from "@/lib/invites/viewer";

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  const title = invitePageTitle(preview);
  const description =
    preview.state === "open"
      ? preview.kind === "challenge"
        ? "Ranked jiu-jitsu match. Tap to accept."
        : "Ranked jiu-jitsu. Tap to join."
      : "Ranked jiu-jitsu. Find out where you stand.";
  return {
    // The og:image must resolve on a stable public host that crawlers can
    // fetch, never the per-deployment VERCEL_URL of the root layout.
    metadataBase: new URL(publicSiteOrigin()),
    title,
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, description, type: "website", siteName: "ELO RATED" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100svh", background: "var(--bg-primary)" }} />}>
      <LandingContent params={params} />
    </Suspense>
  );
}

async function LandingContent({ params }: { params: Params }) {
  const { token } = await params;
  const [preview, viewer, h] = await Promise.all([
    getInvitePreview(token),
    getInviteViewer(),
    headers(),
  ]);
  return (
    <InviteLanding
      token={token}
      preview={preview}
      viewer={viewer}
      inAppBrowser={detectInAppBrowser(h.get("user-agent"))}
    />
  );
}
