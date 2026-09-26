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
  /** Toasts in the most recent snapshot (what is on screen right now). */
  current: SeenToast[] = [];
  private running = true;
  private paused = false;
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
      if (!this.paused) {
        try {
          this.current = toastsIn(await this.idb.describe());
          this.seen = mergeToasts(this.seen, this.current);
          this.samples++;
        } catch {
          /* one failed sample is not evidence either way */
        }
      }
      if (this.running) await new Promise((r) => setTimeout(r, this.intervalMs));
    }
  }

  /** Stop sampling for a while (a timing-sensitive wait), without losing what was seen. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Every distinct toast seen so far. */
  toasts(): SeenToast[] {
    return this.seen;
  }

  /** Stop sampling; every distinct toast seen, and how many snapshots were read. */
  async stop(): Promise<{ toasts: SeenToast[]; samples: number }> {
    this.running = false;
    await this.loop;
    return { toasts: this.seen, samples: this.samples };
  }
}

/**
 * Whether a prompt came back after it had gone: `samples` is the prompt's
 * visibility, in order, from the moment Blue tapped Accept. The accepted
 * prompt is still up (closing) for the first samples; only a prompt seen
 * AFTER a sample without one is a second prompt.
 */
export function secondPromptSeen(samples: boolean[]): boolean {
  let gone = false;
  for (const visible of samples) {
    if (!visible) gone = true;
    else if (gone) return true;
  }
  return false;
}

/** Samples prompt visibility in the background (E19's mid-match check). */
export class PromptSampler {
  readonly samples: boolean[] = [];
  private running = true;
  private readonly loop: Promise<void>;

  constructor(
    private readonly ui: Screens,
    private readonly intervalMs = 300,
    private readonly maxMs = 180_000,
  ) {
    this.loop = this.run();
  }

  private async run(): Promise<void> {
    const until = Date.now() + this.maxMs;
    while (this.running && Date.now() < until) {
      try {
        this.samples.push(await this.ui.isPromptVisible());
      } catch {
        /* skip a failed sample */
      }
      if (this.running) await new Promise((r) => setTimeout(r, this.intervalMs));
    }
  }

  async stop(): Promise<{ second: boolean; samples: number }> {
    this.running = false;
    await this.loop;
    return { second: secondPromptSeen(this.samples), samples: this.samples.length };
  }
}
