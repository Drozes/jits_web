/**
 * Sign in with Apple (lib/auth/apple.ts): hashed nonce to Apple, raw nonce to
 * Supabase, name metadata on first authorization, cancel and error mapping.
 */
const mockSignInAsync = jest.fn();
jest.mock("expo-apple-authentication", () => ({
  signInAsync: (...a: unknown[]) => mockSignInAsync(...a),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "raw-nonce",
  digestStringAsync: jest.fn((_alg: string, v: string) => Promise.resolve(`sha256(${v})`)),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { APPLE_SIGN_IN_FAILED, appleNameMetadata, signInWithApple } from "@/lib/auth/apple";

function client(opts: { signInError?: { message: string } | null; updateError?: { message: string } | null } = {}) {
  return {
    auth: {
      signInWithIdToken: jest.fn(() => Promise.resolve({ data: {}, error: opts.signInError ?? null })),
      updateUser: jest.fn(() => Promise.resolve({ data: {}, error: opts.updateError ?? null })),
    },
  };
}

beforeEach(() => mockSignInAsync.mockReset());

describe("signInWithApple", () => {
  it("sends the hashed nonce to Apple and the raw nonce to Supabase", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "id-token", fullName: null });
    const c = client();
    const r = await signInWithApple(c as never);
    expect(r).toEqual({ status: "signed_in" });
    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: "sha256(raw-nonce)", requestedScopes: [0, 1] }),
    );
    expect(c.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "id-token",
      nonce: "raw-nonce",
    });
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });

  it("stores Apple's first-authorization name as metadata", async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: "id-token",
      fullName: { givenName: "Sam", familyName: "Rivera" },
    });
    const c = client();
    await signInWithApple(c as never);
    expect(c.auth.updateUser).toHaveBeenCalledWith({
      data: { full_name: "Sam Rivera", given_name: "Sam", family_name: "Rivera" },
    });
  });

  it("still signs in when the name metadata write fails", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "t", fullName: { givenName: "Sam" } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await signInWithApple(client({ updateError: { message: "boom" } }) as never);
    expect(r).toEqual({ status: "signed_in" });
    warn.mockRestore();
  });

  it("reads a user cancel as cancelled", async () => {
    mockSignInAsync.mockRejectedValue(Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }));
    expect(await signInWithApple(client() as never)).toEqual({ status: "cancelled" });
  });

  it("maps other Apple failures to the generic message", async () => {
    mockSignInAsync.mockRejectedValue(Object.assign(new Error("x"), { code: "ERR_REQUEST_FAILED" }));
    expect(await signInWithApple(client() as never)).toEqual({ status: "error", message: APPLE_SIGN_IN_FAILED });
  });

  it("errors when Apple returns no identity token", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null });
    const c = client();
    expect(await signInWithApple(c as never)).toEqual({ status: "error", message: APPLE_SIGN_IN_FAILED });
    expect(c.auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("maps a Supabase error to friendly copy and logs the raw message (supabase-js never rejects)", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "t" });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = await signInWithApple(client({ signInError: { message: "Unacceptable audience in id_token" } }) as never);
    expect(r).toEqual({ status: "error", message: APPLE_SIGN_IN_FAILED });
    expect(warn).toHaveBeenCalledWith("[apple] signInWithIdToken failed", "Unacceptable audience in id_token");
    warn.mockRestore();
  });
});

describe("appleNameMetadata", () => {
  it("returns null when Apple sends no name (every sign-in after the first)", () => {
    expect(appleNameMetadata(null)).toBeNull();
    expect(appleNameMetadata({ givenName: " ", familyName: null } as never)).toBeNull();
  });
  it("keeps a single given name", () => {
    expect(appleNameMetadata({ givenName: "Sam", familyName: null } as never)).toEqual({
      full_name: "Sam",
      given_name: "Sam",
    });
  });
});
