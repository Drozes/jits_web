/**
 * MatchFlowContext (lib/match-flow/match-flow-context.tsx): the match in
 * hand and the viewer's roles, for everything the wizard renders.
 */
import * as React from "react";
import { renderHook } from "@testing-library/react-native";
import type { MatchDetails } from "@jits/shared/api/queries";
import { MatchFlowProvider, useMatchFlow } from "@/lib/match-flow/match-flow-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";

const p = (id: string) => ({ athlete_id: id, display_name: id, current_elo: 1500, current_weight: 170, outcome: null });
const MATCH = { id: "M1", participants: [p("me-1"), p("opp-1")] } as unknown as MatchDetails;
const ROLES = deriveMatchRoles(MATCH, "me-1")!;

describe("useMatchFlow", () => {
  it("reads the match and roles the wizard provides", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MatchFlowProvider match={MATCH} roles={ROLES}>
        {children}
      </MatchFlowProvider>
    );
    const { result } = renderHook(() => useMatchFlow(), { wrapper });
    expect(result.current.match).toBe(MATCH);
    expect(result.current.roles).toBe(ROLES);
  });

  it("throws outside the wizard", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useMatchFlow())).toThrow("useMatchFlow must be used inside a MatchFlowProvider");
  });
});
