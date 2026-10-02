import { shareInvite, type ShareableInvite } from "@/lib/invites/share-invite";
import { Button } from "@/components/ui/elo-system/button";

/**
 * One Share button: the iOS share sheet already lists WhatsApp, Messages,
 * Messenger and Instagram. Secondary styling: the screen's one red CTA is
 * elsewhere. `onShared` fires when a share target actually opened.
 */
export function InviteShareRow({ invite, onShared }: { invite: ShareableInvite; onShared?: () => void }) {
  const share = () =>
    void shareInvite(invite).then((shared) => {
      if (shared) onShared?.();
    });
  return <Button variant="secondary" label="Share" onPress={share} />;
}
