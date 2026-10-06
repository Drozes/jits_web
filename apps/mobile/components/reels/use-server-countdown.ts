import * as React from "react";
import { serverRemainingMs } from "./reel-tile-copy";

/**
 * C-B3's live countdown: ms left until `waitDeadlineAt` on the server's clock
 * (see `serverRemainingMs`), ticking once a second while there is time left.
 * The server-minus-device offset is fixed against `receivedAt`, the device
 * time the read carrying `serverNow` landed (`BuildingReel.receivedAt`, set
 * by `useReelLane`). Without it, the first render that sees a new
 * `serverNow` stands in. Null without a deadline.
 */
export function useServerCountdown(
  waitDeadlineAt: string | null,
  serverNow: string | null,
  readReceivedAt?: number,
): number | null {
  const seen = React.useRef<{ serverNow: string | null; at: number } | null>(null);
  if (!seen.current || seen.current.serverNow !== serverNow) seen.current = { serverNow, at: Date.now() };
  const receivedAt = readReceivedAt ?? seen.current.at;
  const [now, setNow] = React.useState(() => Date.now());
  const remaining = serverRemainingMs(waitDeadlineAt, serverNow, receivedAt, Math.max(now, receivedAt));
  const running = remaining != null && remaining > 0;

  React.useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  return remaining;
}
