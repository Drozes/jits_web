import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  toast,
} from "@/components/ui";
import { AuthFormField } from "@/components/auth/auth-form-field";
import { useAuth } from "@/lib/auth/hooks";

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
    >
      <SafeAreaView style={{ flex: 1 }} className="bg-background">
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {submitted ? (
            <Card>
              <CardHeader>
                <CardTitle>Check your email</CardTitle>
                <CardDescription>
                  If an account exists for {email}, we sent a password reset
                  link. Follow the instructions to choose a new password.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex-col items-stretch gap-3">
                <Button onPress={() => router.replace("/login")}>
                  Back to sign in
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Reset your password</CardTitle>
                <CardDescription>
                  Enter your email and we&apos;ll send you a reset link
                </CardDescription>
              </CardHeader>
              <CardContent className="gap-4">
                <AuthFormField
                  label="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="m@example.com"
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => setTouched(true)}
                  error={emailError}
                  showError={touched}
                />
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3">
                <Button
                  onPress={onSubmit}
                  disabled={submitting || (touched && Boolean(emailError))}
                >
                  {submitting ? "Sending..." : "Send reset email"}
                </Button>
                <Pressable onPress={() => router.replace("/login")} hitSlop={8}>
                  <Text className="text-center text-sm text-muted-foreground">
                    Back to sign in
                  </Text>
                </Pressable>
              </CardFooter>
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
