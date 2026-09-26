import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { basename } from "node:path";
import { run } from "../lib/util";
import { trackChild } from "../lib/cleanup";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
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
