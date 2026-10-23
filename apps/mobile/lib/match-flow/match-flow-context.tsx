import * as React from "react";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { TimekeeperMatchState } from "@jits/shared/api/timekeeper";
import type { MatchRoles } from "./match-roles";

/**
 * The match in hand, the viewer's roles in it and, in timekeeper mode, the
 * timekeeper-mode state, for everything the wizard renders (ARCHITECTURE
 * 2.1). Steps read roles here, never a me / opponent pair derived on the
 * spot.
 */
export interface MatchFlowValue {
  match: MatchDetails;
  roles: MatchRoles;
  /**
   * `get_timekeeper_match_state` (`use-timekeeper-state.ts`): null for a
   * two-athlete match, and until a timekeeper-mode match's first read lands.
   */
  tkState: TimekeeperMatchState | null;
}

const MatchFlowContext = React.createContext<MatchFlowValue | null>(null);

export function MatchFlowProvider({
  match,
  roles,
  tkState = null,
  children,
}: Omit<MatchFlowValue, "tkState"> & { tkState?: TimekeeperMatchState | null; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ match, roles, tkState }), [match, roles, tkState]);
  return <MatchFlowContext.Provider value={value}>{children}</MatchFlowContext.Provider>;
}

export function useMatchFlow(): MatchFlowValue {
  const value = React.useContext(MatchFlowContext);
  if (!value) throw new Error("useMatchFlow must be used inside a MatchFlowProvider");
  return value;
}
