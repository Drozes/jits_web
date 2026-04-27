import * as React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text } from "react-native";
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

export default function SignupScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading, signUp } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [touched, setTouched] = React.useState({ email: false, password: false, confirm: false });

  React.useEffect(() => {
    if (!authLoading && user) router.replace("/");
  }, [user, authLoading, router]);

  const emailError = !email.trim() || !email.includes("@") ? "Enter a valid email" : null;
  const passwordError = password.length < 8 ? "At least 8 characters" : null;
  const confirmError = confirmPassword !== password ? "Passwords do not match" : null;
  const formInvalid = Boolean(emailError || passwordError || confirmError);
  const allTouched = touched.email && touched.password && touched.confirm;

  const onSubmit = async () => {
    setTouched({ email: true, password: true, confirm: true });
    if (formInvalid || submitting) return;
    setSubmitting(true);
    const { error } = await signUp(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sign-up email sent");
    setSubmitted(true);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} className="bg-background">
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          {submitted ? (
            <ConfirmEmailCard email={email} onBack={() => router.replace("/login")} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Create your account</CardTitle>
                <CardDescription>Sign up with your email and a password</CardDescription>
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
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  error={emailError}
                  showError={touched.email}
                />
                <AuthFormField
                  label="Password"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder="At least 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  error={passwordError}
                  showError={touched.password}
                />
                <AuthFormField
                  label="Confirm password"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                  error={confirmError}
                  showError={touched.confirm}
                />
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3">
                <Button onPress={onSubmit} disabled={submitting || (allTouched && formInvalid)}>
                  {submitting ? "Creating account..." : "Sign Up"}
                </Button>
                <Pressable onPress={() => router.push("/login")} hitSlop={8}>
                  <Text className="text-center text-sm text-muted-foreground">
                    Already have an account? <Text className="text-primary">Sign in</Text>
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

function ConfirmEmailCard({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a confirmation link to {email}. Open it to finish creating your account.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-stretch gap-3">
        <Button onPress={onBack}>Back to sign in</Button>
      </CardFooter>
    </Card>
  );
}
