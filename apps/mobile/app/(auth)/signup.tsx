import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Plate, Wordmark } from "@/components/ui/elo-system";
import { toast } from "@/components/ui";
import { AppHeader } from "@/components/layout/app-header";
import { AuthFormField } from "@/components/auth/auth-form-field";
import { CtaButton, SecondaryButton } from "@/components/auth/auth-buttons";
import { useAuth } from "@/lib/auth/hooks";
import { APPLE_SIGN_IN_ENABLED } from "@/lib/auth/feature-flags";

/**
 * Mobile signup screen. Mirrors wireframe A2 in spirit (account creation),
 * but defers profile details (name, DOB, gym, etc.) to the post-signup
 * setup wizard (`profile-setup.tsx`), matching the current data flow on
 * mobile. Visual pattern: AppHeader + Plate-wrapped credentials form.
 */
export default function SignupScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading, signUp, signInWithApple } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [appleSubmitting, setAppleSubmitting] = React.useState(false);
  const [appleAvailable, setAppleAvailable] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [needsConfirmation, setNeedsConfirmation] = React.useState(false);
  const [touched, setTouched] = React.useState({
    email: false,
    password: false,
    confirm: false,
  });

  React.useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  // Apple sign-in is iOS-only; probe availability and gate the button.
  // Dynamic import keeps the native module out of Android/web bundles.
  React.useEffect(() => {
    if (Platform.OS !== "ios") return;
    let cancelled = false;
    (async () => {
      const AppleAuthentication = await import("expo-apple-authentication");
      const available = await AppleAuthentication.isAvailableAsync();
      if (!cancelled) setAppleAvailable(available);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const emailError =
    !email.trim() || !email.includes("@") ? "Enter a valid email" : null;
  const passwordError = password.length < 8 ? "At least 8 characters" : null;
  const confirmError =
    confirmPassword !== password ? "Passwords do not match" : null;
  const formInvalid = Boolean(emailError || passwordError || confirmError);
  const allTouched = touched.email && touched.password && touched.confirm;

  const onSubmit = async () => {
    setTouched({ email: true, password: true, confirm: true });
    if (formInvalid || submitting || appleSubmitting) return;
    setSubmitting(true);
    const { error, needsEmailConfirmation } = await signUp(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNeedsConfirmation(needsEmailConfirmation);
    toast.success(
      needsEmailConfirmation ? "Check your email to confirm" : "Account created",
    );
    setSubmitted(true);
  };

  const onApplePress = async () => {
    if (appleSubmitting || submitting) return;
    setAppleSubmitting(true);
    const { error, cancelled } = await signInWithApple();
    setAppleSubmitting(false);
    if (cancelled) return;
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      className="bg-surface"
    >
      <View style={{ flex: 1 }} className="bg-surface">
        <AppHeader title="Create Account" back />
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingVertical: 24,
            gap: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {submitted ? (
            <ConfirmEmailContent
              email={email}
              needsConfirmation={needsConfirmation}
              onBack={() => router.replace("/login")}
            />
          ) : (
            <>
              <View className="items-center gap-2">
                <Wordmark size="lg" />
                <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l">
                  Step 1 of 2 / Account
                </Text>
              </View>

              <Plate className="gap-5">
                <AuthFormField
                  label="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  error={emailError}
                  showError={touched.email}
                />
                <AuthFormField
                  label="Password"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                  textContentType="none"
                  secureTextEntry
                  placeholder="At least 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  error={passwordError}
                  showError={touched.password}
                />
                <AuthFormField
                  label="Confirm Password"
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                  textContentType="none"
                  secureTextEntry
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                  error={confirmError}
                  showError={touched.confirm}
                />
                <CtaButton
                  label={submitting ? "Creating account..." : "Continue"}
                  onPress={onSubmit}
                  disabled={
                    submitting || appleSubmitting || (allTouched && formInvalid)
                  }
                />
                {appleAvailable && APPLE_SIGN_IN_ENABLED ? (
                  <SecondaryButton
                    label={
                      appleSubmitting
                        ? "Opening Apple..."
                        : "Continue with Apple"
                    }
                    onPress={onApplePress}
                    disabled={appleSubmitting || submitting}
                  />
                ) : null}
              </Plate>

              <Pressable onPress={() => router.push("/login")} hitSlop={8}>
                <Text className="text-center font-mono text-[11px] text-ink-2 uppercase tracking-caps-l">
                  Already have an account?{" "}
                  <Text className="text-cta">Sign in</Text>
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function ConfirmEmailContent({
  email,
  needsConfirmation,
  onBack,
}: {
  email: string;
  needsConfirmation: boolean;
  onBack: () => void;
}) {
  return (
    <>
      <View className="items-center gap-2">
        <Wordmark size="lg" />
        <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l">
          {needsConfirmation ? "Check Your Email" : "Account Created"}
        </Text>
      </View>

      <Plate className="gap-4">
        <Text className="font-body text-[14px] text-ink leading-6">
          {needsConfirmation
            ? `We sent a confirmation link to ${email}. Tap it to activate your account, then sign in.`
            : `Your account for ${email} is ready. Sign in to set up your profile.`}
        </Text>
        <CtaButton
          label={needsConfirmation ? "Back to Sign In" : "Sign In"}
          onPress={onBack}
        />
      </Plate>
    </>
  );
}
