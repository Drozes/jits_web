import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import { run } from "../lib/util";
import { trackChild } from "../lib/cleanup";
import { Transform } from "node:stream";
import { redact } from "../lib/redact";

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
    // Redact line by line before anything reaches disk.
    const redactor = () => {
      let carry = "";
      return new Transform({
        transform(chunk, _enc, cb) {
          const text = carry + chunk.toString("utf8");
          const cut = text.lastIndexOf("\n");
          carry = cut === -1 ? text : text.slice(cut + 1);
          cb(null, cut === -1 ? "" : redact(text.slice(0, cut + 1)));
        },
        flush(cb) {
          cb(null, redact(carry));
        },
      });
    };
    child.stdout?.pipe(redactor()).pipe(out, { end: false });
    child.stderr?.pipe(redactor()).pipe(out, { end: false });
    // End the file only after both redactors have flushed.
    let open = 2;
    const done = () => {
      if (--open === 0) out.end();
    };
    child.stdout?.once("end", () => setImmediate(done));
    child.stderr?.once("end", () => setImmediate(done));
    return () => {
      child.kill("SIGINT");
    };
  }
}
