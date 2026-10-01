import * as React from "react";
import { loadPendingInvite, type PendingInvite } from "./pending-invite";

/**
 * The pending invite, read once on mount. `loaded` is false until the read
 * finishes, so a launch gate never redirects before it knows.
 */
export function usePendingInvite(): { pending: PendingInvite | null; loaded: boolean } {
  const [state, setState] = React.useState<{ pending: PendingInvite | null; loaded: boolean }>({
    pending: null,
    loaded: false,
  });
  React.useEffect(() => {
    let cancelled = false;
    void loadPendingInvite().then((pending) => {
      if (!cancelled) setState({ pending, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
