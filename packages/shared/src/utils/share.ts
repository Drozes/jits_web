const BASE_URL = "https://elorated.com";

type ShareContentType = "athlete" | "session" | "gym" | "match-result";

const PATH_MAP: Record<ShareContentType, string> = {
  athlete: "athlete",
  session: "session",
  gym: "gyms",
  "match-result": "athlete",
};

/** Build a shareable URL for a given content type and ID. */
export function buildShareUrl(type: ShareContentType, id: string): string {
  return `${BASE_URL}/${PATH_MAP[type]}/${id}`;
}

interface MatchResultData {
  outcome: "win" | "loss" | "draw";
  elo?: number | null;
  eloDelta?: number | null;
}

interface SessionInviteData {
  gymName: string;
}

interface ProfileData {
  displayName: string;
}

type ShareTextInput =
  | { type: "match-result"; data: MatchResultData }
  | { type: "session"; data: SessionInviteData }
  | { type: "athlete"; data: ProfileData };

/** Build concise, engaging share text for the native share sheet. */
export function buildShareText(input: ShareTextInput): string {
  switch (input.type) {
    case "match-result": {
      const { outcome, elo, eloDelta } = input.data;
      const verb =
        outcome === "win" ? "won" : outcome === "loss" ? "lost" : "drew";
      let text = `I just ${verb} a match on ELO RATED!`;
      if (elo != null && eloDelta != null && eloDelta !== 0) {
        const sign = eloDelta > 0 ? "+" : "";
        text += ` New rating: ${elo} (${sign}${eloDelta})`;
      }
      return text;
    }
    case "session":
      return `Join my session at ${input.data.gymName} on ELO RATED!`;
    case "athlete":
      return `Check out ${input.data.displayName}'s profile on ELO RATED`;
  }
}
