import * as React from "react";
import type { MatchDetails } from "@jits/shared/api/queries";
import type { MatchRoles } from "./match-roles";

/**
 * The match in hand and the viewer's roles in it, for everything the wizard
 * renders (ARCHITECTURE 2.1). Steps read roles here, never a me / opponent
 * pair derived on the spot. The timekeeper state joins it with the
 * timekeeper mode (M1).
 */
export interface MatchFlowValue {
  match: MatchDetails;
  roles: MatchRoles;
}

const MatchFlowContext = React.createContext<MatchFlowValue | null>(null);

export function MatchFlowProvider({ match, roles, children }: MatchFlowValue & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ match, roles }), [match, roles]);
  return <MatchFlowContext.Provider value={value}>{children}</MatchFlowContext.Provider>;
}

export function useMatchFlow(): MatchFlowValue {
  const value = React.useContext(MatchFlowContext);
  if (!value) throw new Error("useMatchFlow must be used inside a MatchFlowProvider");
  return value;
}
