import { signOutKeepInviteAction } from "@/app/c/[token]/actions";
import { BODY_TEXT } from "./styles";

/** `Signed in as <display_name>. Not you?` + Sign out (contract 7). */
export function SignedInAs({ token, displayName }: { token: string; displayName: string | null }) {
  return (
    <form
      action={signOutKeepInviteAction.bind(null, token)}
      style={{ ...BODY_TEXT, textAlign: "center", fontSize: "var(--size-body-s)" }}
    >
      Signed in as{" "}
      <strong style={{ color: "var(--text-primary)" }}>{displayName ?? "your account"}</strong>. Not you?{" "}
      <button
        type="submit"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--text-primary)",
          textDecoration: "underline",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        Sign out
      </button>
    </form>
  );
}
