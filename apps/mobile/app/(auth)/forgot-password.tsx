import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Plate, Wordmark } from "@/components/ui/elo-system";
import { toast } from "@/components/ui";
import { AppHeader } from "@/components/layout/app-header";
import { AuthFormField } from "@/components/auth/auth-form-field";
import { CtaButton, TertiaryButton } from "@/components/auth/auth-buttons";
import { useAuth } from "@/lib/auth/hooks";

/**
 * Forgot-password screen. ELO design system: hero Wordmark + Plate form +
 * primary CTA. After submission, show a confirmation Plate explaining the
 * email handoff.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading, resetPassword } = useAuth();
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const emailError =
    !email.trim() || !email.includes("@") ? "Enter a valid email" : null;

  const onSubmit = async () => {
    setTouched(true);
    if (emailError || submitting) return;
    setSubmitting(true);
    const { error } = await resetPassword(email.trim());
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted(true);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      className="bg-surface"
    >
      <View style={{ flex: 1 }} className="bg-surface">
        <AppHeader title="Reset Password" back />
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingVertical: 24,
            gap: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-2">
            <Wordmark size="lg" />
            <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-l">
              {submitted ? "Check Your Email" : "Send Reset Link"}
            </Text>
          </View>

          {submitted ? (
            <Plate className="gap-4">
              <Text className="font-body text-[14px] text-ink leading-6">
                If an account exists for {email}, we sent a password reset link.
                Follow the instructions to choose a new password.
              </Text>
              <CtaButton
                label="Back to Sign In"
                onPress={() => router.replace("/login")}
              />
            </Plate>
          ) : (
            <>
              <Plate className="gap-5">
                <Text className="font-body text-[14px] text-ink-2 leading-6">
                  Enter the email address linked to your account. We&apos;ll send
                  you a link to reset your password.
                </Text>
                <AuthFormField
                  label="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => setTouched(true)}
                  error={emailError}
                  showError={touched}
                />
                <CtaButton
                  label={submitting ? "Sending..." : "Send Reset Email"}
                  onPress={onSubmit}
                  disabled={submitting || (touched && Boolean(emailError))}
                />
              </Plate>
              <TertiaryButton
                label="Back to Sign In"
                onPress={() => router.replace("/login")}
              />
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
