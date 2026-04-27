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

export default function LoginScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading, signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState({ email: false, password: false });

  // Redirect already-authenticated users away from the auth screen.
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
          <Card>
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>Sign in to continue</CardDescription>
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
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button
                onPress={onSubmit}
                disabled={submitting || (allTouched && formInvalid)}
              >
                {submitting ? "Signing in..." : "Sign In"}
              </Button>
              <Pressable onPress={() => router.push("/signup")} hitSlop={8}>
                <Text className="text-center text-sm text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Text className="text-primary">Sign up</Text>
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push("/forgot-password")} hitSlop={8}>
                <Text className="text-center text-sm text-muted-foreground">
                  Forgot password?
                </Text>
              </Pressable>
            </CardFooter>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
