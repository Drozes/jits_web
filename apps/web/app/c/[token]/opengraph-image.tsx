import { getInvitePreview } from "@/lib/invites/preview";
import { OG_SIZE, renderInviteCard, toJpeg } from "@/lib/invites/og-card";

export const alt = "ELO RATED invite";
export const size = OG_SIZE;
export const contentType = "image/jpeg";

/**
 * Standalone preview card (contract 6): Facebook and Messenger drop the page
 * text, so the card carries the whole invite. Read-only: no telemetry here.
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  const png = await (await renderInviteCard(preview)).arrayBuffer();
  const jpeg = await toJpeg(png);
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      // Messengers cache per URL anyway; keep CDNs from sharing a stale card.
      "Cache-Control": "private, max-age=300",
    },
  });
}
