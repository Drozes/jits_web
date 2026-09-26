/**
 * UI oracles read from the accessibility tree. They return values rather
 * than assert, so the scenario context records expected vs actual.
 */
import type { Screens } from "../sim/screens";
import { ExpectationTimeout } from "../lib/util";

/** Poll the LIVE pill until it matches `visible`. Returns the final state. */
export async function waitLivePill(ui: Screens, visible: boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    const v = await ui.isLivePillVisible();
    if (v === visible) return v;
    if (Date.now() - start > timeoutMs) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Current wizard step, or the timeout evidence. */
export async function stepOrNull(ui: Screens, step: string, timeoutMs: number): Promise<string | null> {
  try {
    await ui.waitStep(step as never, timeoutMs);
    return step;
  } catch (e) {
    if (e instanceof ExpectationTimeout) return (await ui.currentStep()) ?? null;
    throw e;
  }
}

/** Normalise a rendered ELO delta ("▲ +16" / "▼ 8") to a signed number. */
export function parseDelta(label: string | null): number | null {
  if (!label) return null;
  const m = label.match(/([▲▼])\s*\+?(\d+)/);
  if (!m) return null;
  return m[1] === "▲" ? Number(m[2]) : -Number(m[2]);
}
