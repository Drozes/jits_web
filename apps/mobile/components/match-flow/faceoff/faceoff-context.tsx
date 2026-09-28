import * as React from "react";
import { useFaceoff, type Faceoff, type FaceoffParams } from "@/lib/match-flow/use-faceoff";

const FaceoffContext = React.createContext<Faceoff | null>(null);

/**
 * Owns the face-off for the whole wizard. Mounted on every step (so the
 * camera between the face-off header and body keeps one position in the
 * tree), but its channel is open only while `active`.
 */
export function FaceoffProvider({ children, ...params }: FaceoffParams & { children: React.ReactNode }) {
  const faceoff = useFaceoff(params);
  return <FaceoffContext.Provider value={faceoff}>{children}</FaceoffContext.Provider>;
}

export function useFaceoffContext(): Faceoff {
  const ctx = React.useContext(FaceoffContext);
  if (!ctx) throw new Error("useFaceoffContext must be used inside a FaceoffProvider");
  return ctx;
}
