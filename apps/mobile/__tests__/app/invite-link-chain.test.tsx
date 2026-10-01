/**
 * End to end (in-process) for an invite link (jr_be spec 016, contract 6):
 * `elorated://c/<token>` and `https://<host>/c/<token>` reach the REAL
 * `app/c/[token].tsx` through the REAL `+native-intent` mapper and the REAL
 * expo-router (6.0.23), and the stored pre-auth token survives the whole
 * signed-out chain: link -> index -> signup -> (sign in, profile pending)
 * -> invite setup -> (active) -> claim runner.
 *
 * Only auth and the signup / setup / claim screens are stubbed; the link
 * screen, the launch gate (`app/index.tsx`) and AsyncStorage persistence are
 * real.
 *
 * Source: apps/mobile/app/+native-intent.tsx, app/c/[token].tsx, app/index.tsx,
 * lib/invites/pending-invite.ts, lib/invites/launch-route.ts
 */
import * as React from "react";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { renderRouter, act, waitFor } from "expo-router/testing-library";

import { redirectSystemPath } from "@/app/+native-intent";
import { PENDING_INVITE_KEY, loadPendingInvite } from "@/lib/invites/pending-invite";

// eslint-disable-next-line no-var
var mockAuth: { user: unknown; athlete: unknown; isLoading: boolean } = { user: null, athlete: null, isLoading: false };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ ...mockAuth, athleteLoadFailed: false, retryAthleteLoad: jest.fn(), signOut: jest.fn() }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#888" }),
}));

import InviteLinkScreen from "@/app/c/[token]";
import Index from "@/app/index";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt";

const stub = (id: string) =>
  function Stub() {
    return <Text testID={id}>{id}</Text>;
  };

function tree() {
  return {
    index: Index,
    "c/[token]": InviteLinkScreen,
    signup: stub("signup"),
    login: stub("login"),
    "invite-setup": stub("invite-setup"),
    "invite/claim": stub("invite-claim"),
    "profile-setup": stub("profile-setup"),
  };
}

/** The in-app path expo-router derives from a system URL (extractPathFromURL rules). */
function routePathOf(url: string): string {
  const web = url.match(/^https?:\/\/[^/]+(\/[^?#]*)?(\?[^#]*)?/i);
  if (web) return `${web[1] ?? "/"}${web[2] ?? ""}`;
  const custom = url.match(/^[a-z][a-z0-9+.-]*:\/\/([^?#]*)(\?[^#]*)?/i);
  return custom ? `/${custom[1]}${custom[2] ?? ""}` : url;
}

beforeEach(async () => {
  mockAuth = { user: null, athlete: null, isLoading: false };
  await AsyncStorage.clear();
});

describe.each([
  ["scheme link", `elorated://c/${TOKEN}`, "universal_link"],
  ["universal link", `https://elorated.com/c/${TOKEN}`, "universal_link"],
  ["interim host QR link", `https://jitsweb.vercel.app/c/${TOKEN}?src=qr`, "qr"],
])("%s", (_label, url, gateway) => {
  it("is not rewritten by +native-intent and routes to app/c/[token]", async () => {
    const mapped = redirectSystemPath({ path: url, initial: true });
    expect(mapped).toBe(url);
    expect(routePathOf(mapped).split("?")[0]).toBe(`/c/${TOKEN}`);

    const r = renderRouter(tree(), { initialUrl: routePathOf(mapped) });
    // The link screen stores the token, then hands over to index -> signup.
    await waitFor(() => expect(r.getByTestId("signup")).toBeTruthy());
    const stored = await loadPendingInvite();
    expect(stored).toMatchObject({ token: TOKEN, code: null, gateway });
  });
});

it("a pre-auth token survives signup, sign-in, setup and reaches the claim runner", async () => {
  const r = renderRouter(tree(), { initialUrl: `/c/${TOKEN}` });
  await waitFor(() => expect(r.getByTestId("signup")).toBeTruthy());
  const first = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  expect(first).toContain(TOKEN);

  // Email confirmation round trip: the app is relaunched at the login screen
  // and the user signs in; the token is still there.
  act(() => router.replace("/login"));
  expect(r.getByTestId("login")).toBeTruthy();
  mockAuth = { user: { id: "u1" }, athlete: { id: "a1", status: "pending" }, isLoading: false };
  act(() => router.replace("/"));
  await waitFor(() => expect(r.getByTestId("invite-setup")).toBeTruthy());
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBe(first);

  // Setup finishes (athlete active): index routes to the claim runner, still
  // with the same first touch (attribution keeps the original time).
  mockAuth = { user: { id: "u1" }, athlete: { id: "a1", status: "active" }, isLoading: false };
  act(() => router.replace("/"));
  await waitFor(() => expect(r.getByTestId("invite-claim")).toBeTruthy());
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBe(first);
});

it("opening the same link again keeps the original first touch", async () => {
  const r = renderRouter(tree(), { initialUrl: `/c/${TOKEN}` });
  await waitFor(() => expect(r.getByTestId("signup")).toBeTruthy());
  const first = (await loadPendingInvite())?.first_touch_at;
  act(() => router.replace(`/c/${TOKEN}`));
  await waitFor(() => expect(r.getByTestId("signup")).toBeTruthy());
  expect((await loadPendingInvite())?.first_touch_at).toBe(first);
});

it("a malformed token is not stored and the normal signed-out route applies", async () => {
  const r = renderRouter(tree(), { initialUrl: "/c/not-a-token" });
  await waitFor(() => expect(r.getByTestId("login")).toBeTruthy());
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
});
