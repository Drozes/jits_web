import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import { EnvError, run } from "../lib/util";
import { trackChild } from "../lib/cleanup";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { redact } from "../lib/redact";

export interface WindowSize {
  width: number;
  height: number;
}

export type Orientation = "portrait" | "landscape";

/** A window's orientation from its shape (pure, for tests). */
export function orientationOf(size: WindowSize): Orientation {
  return size.width > size.height ? "landscape" : "portrait";
}

/** System Events' `size of window` output ("456, 972"), or null (pure, for tests). */
export function parseWindowSize(out: string): WindowSize | null {
  const m = out.trim().match(/^(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)$/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** The name of the device `udid` in `simctl list devices -j` output, or null (pure, for tests). */
export function deviceNameIn(json: string, udid: string): string | null {
  const parsed = JSON.parse(json) as { devices?: Record<string, { udid: string; name: string }[]> };
  for (const list of Object.values(parsed.devices ?? {})) {
    const hit = list.find((d) => d.udid === udid);
    if (hit) return hit.name;
  }
  return null;
}

/** An AppleScript string literal (pure, for tests). */
export function appleScriptString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The AppleScript that turns the device (pure, for tests): note which app
 * is in front, bring Simulator to the front, wait (up to 2 s) until it IS
 * frontmost, raise this device's window, click Device > Rotate Left /
 * Right, then give the front back to the app that had it. Never a
 * keystroke, which would go to whatever app is in front.
 *
 * Giving the front back matters: while Simulator is frontmost, whatever is
 * typed on the Mac goes to the device as hardware keyboard input, and in a
 * dev build that can open the React Native dev menu and reload the app
 * (seen 2026-10-21, T14 run 2026-10-21T15-28-24-675Z: key events reached the
 * app during practice's rotations, the dev menu opened and the JS reloaded,
 * which reset practice to its offline lobby). Simulator is now in front
 * only for the click. Prints true when it clicked, false when Simulator
 * never came to the front.
 */
export function rotateScript(deviceName: string, direction: "left" | "right"): string {
  const item = direction === "left" ? "Rotate Left" : "Rotate Right";
  return [
    'tell application "System Events" to set previousApp to name of first application process whose frontmost is true',
    'tell application "Simulator" to activate',
    "set clicked to false",
    'tell application "System Events" to tell process "Simulator"',
    "  repeat 20 times",
    "    if frontmost then exit repeat",
    "    delay 0.1",
    "  end repeat",
    "  if frontmost then",
    `    perform action "AXRaise" of (first window whose name starts with ${appleScriptString(deviceName)})`,
    `    click menu item "${item}" of menu "Device" of menu bar 1`,
    "    set clicked to true",
    "  end if",
    "end tell",
    'if previousApp is not "Simulator" then',
    "  try",
    '    tell application "System Events" to set frontmost of process previousApp to true',
    "  end try",
    "end if",
    "return clicked",
  ].join("\n");
}

/** `xcrun simctl` wrapper for the one simulator under test. */
export class Simctl {
  private appName: string | null = null;

  constructor(
    readonly udid: string,
    readonly bundleId: string,
  ) {}

  private simctl(args: string[], timeoutMs = 30_000) {
    return run("xcrun", ["simctl", ...args], { timeoutMs });
  }

  async screenshot(path: string): Promise<void> {
    await this.simctl(["io", this.udid, "screenshot", "--type=png", path]);
  }

  async openUrl(url: string): Promise<void> {
    await this.simctl(["openurl", this.udid, url]);
  }

  async terminate(): Promise<void> {
    await this.simctl(["terminate", this.udid, this.bundleId]).catch(() => undefined);
  }

  async launch(): Promise<void> {
    await this.simctl(["launch", this.udid, this.bundleId]);
  }

  async privacy(action: "grant" | "revoke" | "reset", services: string[]): Promise<void> {
    for (const s of services) {
      await this.simctl(["privacy", this.udid, action, s, this.bundleId]);
    }
  }

  async keychainReset(): Promise<void> {
    await this.simctl(["keychain", this.udid, "reset"]);
  }

  /** The simulator's device name (Simulator.app titles its window with it). */
  async deviceName(): Promise<string> {
    const { stdout } = await this.simctl(["list", "devices", "-j"]);
    const name = deviceNameIn(stdout, this.udid);
    if (!name) throw new EnvError(`simulator ${this.udid} is not in simctl's device list`);
    return name;
  }

  /** The size of this simulator's window in Simulator.app (System Events). */
  async windowSize(name?: string): Promise<WindowSize> {
    const device = name ?? (await this.deviceName());
    const { stdout } = await run(
      "osascript",
      ["-e", `tell application "System Events" to tell process "Simulator" to get size of (first window whose name starts with ${appleScriptString(device)})`],
      { timeoutMs: 10_000 },
    );
    const size = parseWindowSize(stdout);
    if (!size) throw new EnvError(`could not read the Simulator window size for ${device}: ${stdout.trim()}`);
    return size;
  }

  /**
   * Rotate the simulated device (T14, the capture policy: the app must stay
   * portrait) and wait until the DEVICE has turned to `expect`. simctl has
   * no rotate command, so this clicks Simulator.app's own Device > Rotate
   * Left / Right through System Events (the shell running the harness needs
   * the macOS Accessibility permission). The click is made only once
   * Simulator is the frontmost app with this device's window raised: the
   * menu does nothing for a background Simulator, and a keyboard shortcut
   * would go to whatever app is in front (seen 2026-10-21: the terminal took
   * focus back and a cmd+arrow never reached the simulator). The device's
   * orientation is read back from the window's shape, never from the app (a
   * portrait-locked app keeps its own frame portrait either way), so an app
   * check after this can never pass on a rotation that did not happen.
   * Up to three attempts (harness mechanics, not the app under test); a
   * window that never turns is an EnvError, like a missing permission.
   */
  async rotate(direction: "left" | "right", expect: Orientation): Promise<WindowSize> {
    const name = await this.deviceName();
    let size = await this.windowSize(name);
    for (let attempt = 1; attempt <= 3 && orientationOf(size) !== expect; attempt++) {
      let out: string;
      try {
        ({ stdout: out } = await run("osascript", ["-e", rotateScript(name, direction)], { timeoutMs: 10_000 }));
      } catch (e) {
        throw new EnvError(`could not rotate the simulator (System Events needs the Accessibility permission): ${e instanceof Error ? e.message : e}`);
      }
      if (out.trim() !== "true") continue; // Simulator never came to the front: try again
      const t0 = Date.now();
      size = await this.windowSize(name);
      while (orientationOf(size) !== expect && Date.now() - t0 < 3_000) {
        await new Promise((r) => setTimeout(r, 250));
        size = await this.windowSize(name);
      }
    }
    if (orientationOf(size) !== expect) {
      throw new EnvError(`the simulator did not turn ${expect} after Rotate ${direction} (window ${size.width}x${size.height})`);
    }
    // The window turns before the rotation animation inside it ends; let it
    // land before anything reads the app's frame.
    await new Promise((r) => setTimeout(r, 1_000));
    return size;
  }

  async isBooted(): Promise<boolean> {
    const { stdout } = await this.simctl(["list", "devices", "booted", "-j"]);
    return stdout.includes(this.udid);
  }

  async isInstalled(): Promise<boolean> {
    try {
      await this.simctl(["get_app_container", this.udid, this.bundleId]);
      return true;
    } catch {
      return false;
    }
  }

  /** Executable name of the app, for the log-stream predicate. */
  async executableName(): Promise<string> {
    if (this.appName) return this.appName;
    const { stdout } = await this.simctl(["get_app_container", this.udid, this.bundleId]);
    this.appName = basename(stdout.trim()).replace(/\.app$/, "");
    return this.appName;
  }

  /** Stream the app's unified log into a file (artifact only). */
  async startLogStream(path: string): Promise<() => void> {
    const name = await this.executableName();
    const out = createWriteStream(path);
    const child: ChildProcess = spawn(
      "xcrun",
      ["simctl", "spawn", this.udid, "log", "stream", "--style", "compact", "--level", "info", "--predicate", `process == "${name}"`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    trackChild(child);
    // Redact line by line before anything reaches disk. StringDecoder keeps a
    // multi-byte character split across chunks intact.
    const redactor = () => {
      const decoder = new StringDecoder("utf8");
      let carry = "";
      return new Transform({
        transform(chunk: Buffer, _enc, cb) {
          const text = carry + decoder.write(chunk);
          const cut = text.lastIndexOf("\n");
          carry = cut === -1 ? text : text.slice(cut + 1);
          cb(null, cut === -1 ? "" : redact(text.slice(0, cut + 1)));
        },
        flush(cb) {
          cb(null, redact(carry + decoder.end()));
        },
      });
    };
    // End the file only once BOTH redactors have flushed their last line.
    let open = 2;
    const done = () => {
      if (--open === 0) out.end();
    };
    for (const src of [child.stdout, child.stderr]) {
      if (!src) {
        done();
        continue;
      }
      const r = redactor();
      r.on("end", done);
      src.pipe(r);
      r.on("data", (d: Buffer | string) => out.write(d));
    }
    return () => {
      child.kill("SIGINT");
    };
  }
}
