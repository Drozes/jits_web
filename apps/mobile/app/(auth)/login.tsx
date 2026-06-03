import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Wordmark, Plate } from "@/components/ui/elo-system";
import { toast } from "@/components/ui";
import { AuthFormField } from "@/components/auth/auth-form-field";
import {
  CtaButton,
  SecondaryButton,
  TertiaryButton,
} from "@/components/auth/auth-buttons";
import { useAuth } from "@/lib/auth/hooks";

/**
 * Mobile login screen. Mirrors the wireframe A1 visual pattern:
 *   - Hero Wordmark + "What's your number?" caption
 *   - Plate-wrapped email + password form
 *   - Primary CTA (Sign In), secondary register link, tertiary forgot link
 */
export default function LoginScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading, signIn, signInWithGoogle } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [googleSubmitting, setGoogleSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState({ email: false, password: false });

  React.useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const emailError =
    !email.trim() || !email.includes("@") ? "Enter a valid email" : null;
  const passwordError = password.length < 8 ? "At least 8 characters" : null;
  const formInvalid = Boolean(emailError || passwordError);
  const allTouched = touched.email && touched.password;

  const onSubmit = async () => {
    setTouched({ email: true, password: true });
    if (formInvalid || submitting) return;
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/");
  };

  const onGooglePress = async () => {
    if (googleSubmitting || submitting) return;
    setGoogleSubmitting(true);
    const { error, cancelled } = await signInWithGoogle();
    setGoogleSubmitting(false);
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
    >
      <SafeAreaView style={{ flex: 1 }} className="bg-surface">
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingVertical: 32,
            justifyContent: "center",
            gap: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center gap-3">
            <Wordmark size="hero" />
            <Text className="font-mono text-[11px] text-ink-3 uppercase tracking-caps-xl">
              What&apos;s your number?
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
              autoComplete="current-password"
              autoCorrect={false}
              secureTextEntry
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              error={passwordError}
              showError={touched.password}
            />
            <CtaButton
              label={submitting ? "Signing in..." : "Sign In"}
              onPress={onSubmit}
              disabled={submitting || (allTouched && formInvalid)}
            />
            <SecondaryButton
              label={
                googleSubmitting ? "Opening Google..." : "Continue with Google"
              }
              onPress={onGooglePress}
              disabled={googleSubmitting || submitting}
            />
          </Plate>

          <View className="gap-3">
            <Pressable
              onPress={() => router.push("/signup")}
              hitSlop={8}
              accessibilityRole="button"
              className="active:opacity-70"
            >
              <Text className="text-center font-mono text-[11px] text-ink-2 uppercase tracking-caps-l">
                Don&apos;t have an account?{" "}
                <Text className="text-cta">Register</Text>
              </Text>
            </Pressable>
            <TertiaryButton
              label="Forgot password?"
              onPress={() => router.push("/forgot-password")}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
