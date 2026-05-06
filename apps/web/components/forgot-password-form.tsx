"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthFormShell } from "@/components/auth/auth-form-shell";
import { EmailInput } from "@/components/auth/email-input";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <AuthFormShell
        title="Check Your Email"
        description="Password reset instructions sent"
        className={className}
        {...props}
      >
        <p className="text-sm text-muted-foreground">
          If you registered using your email and password, you will receive a
          password reset email.
        </p>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell
      title="Reset Your Password"
      description="Type in your email and we&apos;ll send you a link to reset your password"
      className={className}
      {...props}
    >
      <form onSubmit={handleForgotPassword}>
        <div className="flex flex-col gap-6">
          <EmailInput value={email} onChange={setEmail} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Sending..." : "Send reset email"}
          </Button>
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
