import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/lib/auth/hooks";

/**
 * Root error boundary. Catches uncaught render errors anywhere below it and
 * renders a fallback with two actions:
 *   - "Try again" -- resets the boundary state.
 *   - "Sign out" -- calls `useAuth().signOut`, which puts the user back at
 *     the auth screen. This is a last-resort escape hatch when the same
 *     error keeps repeating after retry.
 *
 * React error boundaries must be class components, but we want to call
 * `useAuth()` for sign-out. The fallback UI is a function component that
 * uses the hook; the class component renders it.
 */
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  // `useAuth` may be unavailable if AuthProvider itself crashed; guard with try.
  let signOut: (() => Promise<void>) | null = null;
  try {
    signOut = useAuth().signOut;
  } catch {
    signOut = null;
  }

  const handleSignOut = React.useCallback(async () => {
    if (!signOut) {
      onRetry();
      return;
    }
    await signOut();
    onRetry();
  }, [signOut, onRetry]);

  return (
    <View className="flex-1 bg-background items-center justify-center px-8 gap-6">
      <Text className="text-3xl font-bold text-foreground">
        Something went wrong
      </Text>
      <Text className="text-sm text-muted-foreground text-center">
        The app hit an unexpected error. Try again, or sign out and back in if
        the problem persists.
      </Text>
      {__DEV__ ? (
        <Text className="text-xs text-destructive text-center font-mono">
          {error.message}
        </Text>
      ) : null}

      <View className="gap-3 w-full">
        <Pressable
          onPress={onRetry}
          className="rounded-md bg-primary py-3 items-center active:opacity-80"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            Try again
          </Text>
        </Pressable>

        {signOut ? (
          <Pressable
            onPress={handleSignOut}
            className="rounded-md border border-border py-3 items-center active:bg-muted/40"
          >
            <Text className="text-sm font-medium text-foreground">
              Sign out
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
