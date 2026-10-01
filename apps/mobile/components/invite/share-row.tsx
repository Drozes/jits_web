import { SecondaryButton } from "@/components/auth/auth-buttons";
import { shareInvite, type ShareableInvite } from "@/lib/invites/share-invite";

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
  return <SecondaryButton label="Share" onPress={share} />;
}
