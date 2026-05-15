"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface AppleOAuthButtonProps {
  disabled?: boolean;
  onError: (message: string) => void;
}

export function AppleOAuthButton({ disabled, onError }: AppleOAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    const supabase = createClient();
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      onError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className="font-heading font-bold uppercase"
      style={{
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-hairline-strong)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-5)",
        fontSize: "var(--size-label-l)",
        letterSpacing: "var(--ls-caps)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-2)",
        width: "100%",
        cursor: disabled || isLoading ? "not-allowed" : "pointer",
        opacity: disabled || isLoading ? "var(--opacity-disabled)" : 1,
        transition: "background var(--motion-hover), border-color var(--motion-hover)",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 384 512"
        style={{ width: 16, height: 16 }}
        fill="currentColor"
      >
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      {isLoading ? "Redirecting..." : "Sign in with Apple"}
    </button>
  );
}
