import * as React from "react";

/**
 * How long a timekeeper-mode server press waits for its reply before it ends
 * as failed (PM29). No layer times a request out on its own: not the
 * mutation queue, not supabase-js, and not React Native 0.81 (Android's
 * OkHttp timeouts are 0, iOS passes the unset XHR timeout through), and the
 * steps that wait on these presses (confirm, result, the timekeeper's edit
 * form) have no in-app exit. 20 s is the house's `CLAIM_STALE_MS`: a working
 * connection answers one RPC in about a second, and a retry after a late
 * landing is safe (each press is idempotent or refused as moved on).
 */
export const SEND_CEILING_MS = 20_000;

/**
 * A press that threw or gave no reply within `SEND_CEILING_MS`, as a refusal
 * of class failed. It carries no words: a timekeeper-mode screen shows the
 * shipped title and `Check your connection and try again.`, never a
 * DomainError message (M-R4).
 */
export const NO_REPLY = { ok: false, error: { code: "UNKNOWN", message: "" } } as const;

export type NoReply = typeof NO_REPLY;

/**
 * The ceiling for one screen's timekeeper-mode presses. `within(call)`
 * resolves with the call's own reply, or with `NO_REPLY` once it threw or
 * `SEND_CEILING_MS` passed without a reply; a later reply is dropped (the
 * screen's reads show a late landing). After the caller unmounts it never
 * resolves, so a reply then shows nothing, and its timers are cleared.
 */
export function useSendCeiling(): { within: <R>(call: PromiseLike<R>) => Promise<R | NoReply> } {
  const live = React.useRef({ mounted: true, timers: new Set<ReturnType<typeof setTimeout>>() });
  React.useEffect(() => {
    const l = live.current;
    l.mounted = true;
    return () => {
      l.mounted = false;
      for (const t of l.timers) clearTimeout(t);
      l.timers.clear();
    };
  }, []);

  const within = React.useCallback(<R,>(call: PromiseLike<R>): Promise<R | NoReply> => {
    const l = live.current;
    return new Promise<R | NoReply>((resolve) => {
      const settle = (reply: R | NoReply) => {
        clearTimeout(timer);
        l.timers.delete(timer);
        if (l.mounted) resolve(reply);
      };
      const timer = setTimeout(() => settle(NO_REPLY), SEND_CEILING_MS);
      l.timers.add(timer);
      Promise.resolve(call).then(settle, () => settle(NO_REPLY));
    });
  }, []);

  return React.useMemo(() => ({ within }), [within]);
}
