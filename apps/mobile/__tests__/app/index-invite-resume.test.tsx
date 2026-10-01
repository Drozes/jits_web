/**
 * Launch resume of a pending invite (jr_be spec 016, contract 6): the REAL
 * `app/index.tsx` reads the stored invite before its Home / setup redirects,
 * so an invitee is never dropped on Home or login.
 *
 * Source: apps/mobile/app/index.tsx, lib/invites/*
 */
import * as React from "react";
import { render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PENDING_INVITE_KEY, makePendingInvite } from "@/lib/invites/pending-invite";

// eslint-disable-next-line no-var
var mockAuth: { user: unknown; athlete: unknown; isLoading: boolean } = { user: null, athlete: null, isLoading: false };
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({
    ...mockAuth,
    athleteLoadFailed: false,
    retryAthleteLoad: jest.fn(),
    signOut: jest.fn(),
  }),
}));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: T } = require("react-native");
    return <T testID="redirect">{href}</T>;
  },
}));

import Index from "@/app/index";

const TOKEN = "Ab3_dE-fGhIjKlMnOpQrSt";

async function target(): Promise<string> {
  const r = render(<Index />);
  await waitFor(() => expect(r.getByTestId("redirect")).toBeTruthy());
  return String(r.getByTestId("redirect").props.children);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it("signed out with a pending invite goes to signup, not login", async () => {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(makePendingInvite({ token: TOKEN }, "universal_link")));
  mockAuth = { user: null, athlete: null, isLoading: false };
  expect(await target()).toBe("/signup");
});

it("a pending profile resumes the one-screen invite setup", async () => {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(makePendingInvite({ code: "K7Q4M2" }, "code")));
  mockAuth = { user: { id: "u1" }, athlete: { status: "pending" }, isLoading: false };
  expect(await target()).toBe("/invite-setup");
});

it("an active athlete runs the claim instead of landing on Home", async () => {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(makePendingInvite({ token: TOKEN }, "universal_link")));
  mockAuth = { user: { id: "u1" }, athlete: { status: "active" }, isLoading: false };
  expect(await target()).toBe("/invite/claim");
});

it("an expired invite is ignored and the normal redirects apply", async () => {
  const stale = makePendingInvite({ code: "K7Q4M2" }, "code", new Date(Date.now() - 31 * 60 * 1000));
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(stale));
  mockAuth = { user: { id: "u1" }, athlete: { status: "active" }, isLoading: false };
  expect(await target()).toBe("/(app)/(home)");
  expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
});

it("no invite, signed out: login as before", async () => {
  mockAuth = { user: null, athlete: null, isLoading: false };
  expect(await target()).toBe("/login");
});
