/**
 * `/c/<token>` (jr_be spec 016): the invite link, opened by a universal link,
 * the scheme link or a scanned QR. Works signed out. It only stores the token
 * (pre-auth persistence) and hands over to `app/index.tsx`, which routes to
 * signup, invite setup or the claim runner. expo-router routes the URL here
 * itself; there is deliberately no router.push bootstrap.
 */
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { bufferTokenCaptured, makePendingInvite, savePendingInvite } from "@/lib/invites/pending-invite";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function InviteLinkScreen() {
  const { token, src } = useLocalSearchParams<{ token?: string; src?: string }>();
  const tokens = useThemedTokens();
  const [stored, setStored] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const gateway = src === "qr" ? "qr" : "universal_link";
    const pending = makePendingInvite({ token: typeof token === "string" ? token : null }, gateway);
    void (async () => {
      if (pending) {
        await savePendingInvite(pending);
        await bufferTokenCaptured({ token: pending.token, captured_at: pending.first_touch_at, gateway });
      }
      if (!cancelled) setStored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, src]);

  if (!stored) {
    return (
      <View className="flex-1 items-center justify-center bg-surface" accessibilityLabel="Opening invite">
        <ActivityIndicator color={tokens.textSecondary} />
      </View>
    );
  }
  // A malformed token was not stored; index then routes as if there were no link.
  return <Redirect href="/" />;
}
