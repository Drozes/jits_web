import { AppHeader } from "@/components/layout/app-header";
import { MatchDetailErrorPanel } from "./match-detail-states";

/** `notFound()` from the content (unknown or malformed match id) lands here. */
export default function MatchNotFound() {
  return (
    <>
      <AppHeader title="Match" back />
      <MatchDetailErrorPanel kind="not-found" />
    </>
  );
}
