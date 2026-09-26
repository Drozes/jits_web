/**
 * UI oracles read from the accessibility tree. They return values rather
 * than assert, so the scenario context records expected vs actual.
 */
import type { Screens } from "../sim/screens";
import type { AXElement, Idb } from "../sim/idb";
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

/** A toast seen on screen. `type` is from the BrandToast testID (`toast-<type>`). */
export interface SeenToast {
  type: "error" | "info" | "success";
  label: string | null;
}

/**
 * Toasts in one accessibility snapshot. BrandToast
 * (apps/mobile/components/ui/toast.tsx) is a Pressable with testID
 * `toast-<type>`, which surfaces as AXUniqueId like other Pressables.
 */
export function toastsIn(els: AXElement[]): SeenToast[] {
  const out: SeenToast[] = [];
  for (const e of els) {
    const m = (e.AXUniqueId ?? "").match(/^toast-(error|info|success)$/);
    if (m) out.push({ type: m[1] as SeenToast["type"], label: e.AXLabel });
  }
  return out;
}

/** Distinct toasts across snapshots (one toast stays up for several polls). */
export function mergeToasts(seen: SeenToast[], next: SeenToast[]): SeenToast[] {
  const key = (t: SeenToast) => `${t.type}|${t.label ?? ""}`;
  const have = new Set(seen.map(key));
  const merged = [...seen];
  for (const t of next) {
    if (have.has(key(t))) continue;
    have.add(key(t));
    merged.push(t);
  }
  return merged;
}

/**
 * Samples the screen in the background and collects every toast shown while
 * it runs. Toasts are transient (about 4s), so a scenario starts the watch
 * before the action and stops it once the outcome has settled.
 */
export class ToastWatch {
  private seen: SeenToast[] = [];
  private running = true;
  private samples = 0;
  private readonly loop: Promise<void>;

  constructor(
    private readonly idb: Idb,
    private readonly intervalMs = 300,
    /** Hard ceiling, so a scenario that dies before `stop()` cannot leave it polling. */
    private readonly maxMs = 180_000,
  ) {
    this.loop = this.run();
  }

  private async run(): Promise<void> {
    const until = Date.now() + this.maxMs;
    while (this.running && Date.now() < until) {
      try {
        this.seen = mergeToasts(this.seen, toastsIn(await this.idb.describe()));
        this.samples++;
      } catch {
        /* one failed sample is not evidence either way */
      }
      if (this.running) await new Promise((r) => setTimeout(r, this.intervalMs));
    }
  }

  /** Stop sampling; every distinct toast seen, and how many snapshots were read. */
  async stop(): Promise<{ toasts: SeenToast[]; samples: number }> {
    this.running = false;
    await this.loop;
    return { toasts: this.seen, samples: this.samples };
  }
}
