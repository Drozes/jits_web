/**
 * The open challenges list (jr_be spec 016): hidden while empty, and re-read
 * when `reloadKey` changes (Friends coming back into focus after an invite
 * was created or withdrawn elsewhere).
 *
 * Source: apps/mobile/components/invite/open-challenges.tsx
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockList = jest.fn();
jest.mock("@jits/shared/api/invites", () => ({
  listMyOpenChallengeInvites: (...a: unknown[]) => mockList(...a),
  revokeInvite: jest.fn(),
}));

import { OpenChallenges } from "@/components/invite/open-challenges";

const row = (id: string) => ({
  id,
  short_code: null,
  code_expires_at: null,
  link_expires_at: new Date(Date.now() + 864e5).toISOString(),
  created_at: new Date().toISOString(),
});

it("re-reads the list when reloadKey changes", async () => {
  mockList.mockResolvedValue({ ok: true, data: [] });
  const view = render(<OpenChallenges athleteId="me" reloadKey={0} />);
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId("open-challenges")).toBeNull();

  mockList.mockResolvedValue({ ok: true, data: [row("i1")] });
  view.rerender(<OpenChallenges athleteId="me" reloadKey={1} />);
  expect(await screen.findByTestId("open-challenge-i1")).toBeTruthy();
  expect(mockList).toHaveBeenCalledTimes(2);
});
