import * as React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { toast } from "@/components/ui";
import { signInWithApple, useAppleSignInAvailable } from "@/lib/auth/apple";
import { useResolvedColorScheme } from "@/lib/theme/use-theme";

interface AppleSignInButtonProps {
  /** `continue` on signup (the one-tap path), `sign-in` on login. */
  variant?: "sign-in" | "continue";
  /** Where to go once signed in. Defaults to `/`, which resumes a pending invite. */
  onSignedIn?: () => void;
}

/**
 * Apple's own button (required styling for guideline 4.8), themed to the
 * system scheme: black on light, white on dark. Renders nothing where Sign in
 * with Apple is unavailable (Android, web, old iOS), so it can be mounted
 * unconditionally in the auth screens' slot.
 */
export function AppleSignInButton({ variant = "sign-in", onSignedIn }: AppleSignInButtonProps) {
  const router = useRouter();
  const available = useAppleSignInAvailable();
  const scheme = useResolvedColorScheme();
  const busy = React.useRef(false);

  if (!available) return null;

  const onPress = async () => {
    if (busy.current) return;
    busy.current = true;
    const result = await signInWithApple();
    busy.current = false;
    if (result.status === "cancelled") return;
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    if (onSignedIn) onSignedIn();
    else router.replace("/");
  };

  return (
    <View testID="apple-sign-in">
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          variant === "continue"
            ? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={
          scheme === "dark"
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={4}
        style={{ width: "100%", height: 52 }}
        onPress={onPress}
      />
    </View>
  );
}
