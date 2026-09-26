/**
 * Runtime proof that the SIMULATOR APP talks to this local stack. The dotenv
 * check in config.ts is only static (a stale bundle, a dev-client URL
 * override or a hand-edited env could still point the app elsewhere), so a
 * throwaway Red bot connected to the LOCAL realtime must see Blue's app in
 * the app-wide `app:online` presence. Blue's app must be signed in and in the
 * foreground. Runs in preflight AND at the start of every scenario.
 */
import type { AthleteIds, Config } from "../config";
import { EnvError } from "../lib/util";
import { MobileOpponent } from "./opponent";
import { Trace } from "./trace";

export async function proveAppOnLocalStack(cfg: Config, ids: AthleteIds, password: string, timeoutMs = 20_000): Promise<string> {
  const b = new MobileOpponent(cfg, { id: ids.red, email: cfg.emails.red, displayName: cfg.names.red, key: "red" }, new Trace(null), password);
  try {
    await b.signIn();
    await b.ready();
    const start = Date.now();
    while (!b.appOnline.has(ids.blue)) {
      if (Date.now() - start > timeoutMs) {
        throw new EnvError(
          "Blue's app never appeared in app:online on the LOCAL realtime: the simulator app is not talking to the local stack (or is not signed in / not in the foreground)",
        );
      }
      await new Promise((res) => setTimeout(res, 500));
    }
    return "Blue present in local app:online";
  } finally {
    await b.close();
  }
}
