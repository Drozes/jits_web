"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { EmailInput } from "@/components/auth/email-input";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }
    try {
      const { error } = await createClient().auth.signUp({ email, password });
      if (error) throw error;
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthFormShell
      title="Sign up"
      description="Create a new account"
      className={className}
      {...props}
    >
      <form onSubmit={handleSignUp}>
        <div className="flex flex-col gap-6">
          <EmailInput value={email} onChange={setEmail} />
          <PasswordInput
            id="password"
            label="Password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
          <PasswordInput
            id="repeat-password"
            label="Repeat Password"
            autoComplete="new-password"
            value={repeatPassword}
            onChange={setRepeatPassword}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating an account..." : "Sign up"}
          </Button>
          <GoogleOAuthButton disabled={isLoading} onError={setError} />
        </div>
        <div className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Login
          </Link>
        </div>
      </form>
    </AuthFormShell>
  );
}
