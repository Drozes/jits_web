/**
 * A render wrapper that provides what the wizard provides to everything it
 * renders (`MatchFlowProvider`): a two-athlete match in hand and the
 * viewer's roles in it, derived the way the wizard derives them.
 */
import * as React from "react";
import type { MatchDetails } from "@jits/shared/api/queries";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";

const participant = (id: string) => ({
  athlete_id: id,
  display_name: id,
  current_elo: null,
  current_weight: null,
  profile_photo_url: null,
  role: "competitor",
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: null,
  weight_division_gap: null,
});

export function matchFlowWrapper(meId = "me", opponentId = "opp") {
  const match = { id: "M1", participants: [participant(meId), participant(opponentId)] } as unknown as MatchDetails;
  const roles = deriveMatchRoles(match, meId);
  if (!roles) throw new Error("matchFlowWrapper: the viewer must be one of the two athletes");
  return function MatchFlowWrapper({ children }: { children: React.ReactNode }) {
    return (
      <MatchFlowProvider match={match} roles={roles}>
        {children}
      </MatchFlowProvider>
    );
  };
}
