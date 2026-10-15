/**
 * Google sign-in cancel (jits-mafl.2 M10): @react-native-google-signin v16
 * RESOLVES `{ type: "cancelled", data: null }` when the athlete backs out of
 * the account picker (both platforms). That is a silent cancel, never the
 * "Google did not return an ID token." error. `signInWithGoogle` maps the
 * resolution through `readGoogleSignInResult` (its dynamic import of the
 * native module cannot run under Jest, so the mapping is tested here and the
 * wiring is pinned at the source).
 *
 * Source: apps/mobile/lib/auth/google-sign-in-result.ts, lib/auth/auth-context.tsx
 */
import * as fs from "fs";
import * as path from "path";
import { readGoogleSignInResult } from "@/lib/auth/google-sign-in-result";

describe("readGoogleSignInResult", () => {
  it("v16 cancelled response is a cancel", () => {
    expect(readGoogleSignInResult({ type: "cancelled", data: null })).toEqual({ kind: "cancelled" });
  });

  it("v16 success carries data.idToken", () => {
    expect(readGoogleSignInResult({ type: "success", data: { idToken: "tok-1", user: {} } })).toEqual({
      kind: "token",
      idToken: "tok-1",
    });
  });

  it("the pre-v13 top-level idToken still reads", () => {
    expect(readGoogleSignInResult({ idToken: "tok-old" })).toEqual({ kind: "token", idToken: "tok-old" });
  });

  it.each([
    ["a success with a null token", { type: "success", data: { idToken: null } }],
    ["no data", { type: "success", data: null }],
    ["nothing", undefined],
  ])("%s has no token (the caller reports it)", (_c, r) => {
    expect(readGoogleSignInResult(r)).toEqual({ kind: "token", idToken: null });
  });
});

describe("signInWithGoogle wiring", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../lib/auth/auth-context.tsx"), "utf8");
  const body = src.slice(src.indexOf("const signInWithGoogle"), src.indexOf("const signUp"));

  it("maps the signIn() resolution through readGoogleSignInResult", () => {
    expect(body).toMatch(/readGoogleSignInResult\(\s*await\s+GoogleSignin\.signIn\(\)\s*\)/);
  });

  it("a cancelled outcome returns a silent cancel before any ID token check", () => {
    const cancel = body.search(/kind\s*===\s*["']cancelled["'][\s\S]{0,80}?cancelled:\s*true/);
    const noToken = body.search(/did not return an ID token/);
    expect(cancel).toBeGreaterThan(-1);
    expect(noToken).toBeGreaterThan(cancel);
  });
});
