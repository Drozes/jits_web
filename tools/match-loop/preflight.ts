/**
 * Preflight: is the stack in a state where a scenario verdict means anything?
 * Each check may auto-fix ONCE; a check that still fails stops the loop.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AthleteIds, Config } from "./config";
import { REPO_ROOT, assertSafe } from "./config";
import { psql, queryJson } from "./lib/psql";
import { run, log } from "./lib/util";
import { proveAppOnLocalStack } from "./bot/app-on-local";
import type { Idb } from "./sim/idb";
import type { Simctl } from "./sim/simctl";
import type { Screens } from "./sim/screens";

export interface CheckResult {
  id: string;
  ok: boolean;
  detail?: unknown;
  fixed?: boolean;
}

export interface PreflightDeps {
  cfg: Config;
  ids: AthleteIds;
  password: string;
  idb: Idb;
  simctl: Simctl;
  ui: Screens;
  /** "core" wants camera/mic revoked; "camera" (E13) wants them granted. */
  camera: "revoked" | "granted";
  typecheck: boolean;
}

async function check(
  results: CheckResult[],
  id: string,
  probe: () => Promise<unknown>,
  fix?: () => Promise<void>,
): Promise<boolean> {
  try {
    const detail = await probe();
    results.push({ id, ok: true, detail });
    log(`preflight ok   ${id}`);
    return true;
  } catch (e) {
    const first = e instanceof Error ? e.message : String(e);
    if (fix) {
      try {
        await fix();
        const detail = await probe();
        results.push({ id, ok: true, detail, fixed: true });
        log(`preflight FIXED ${id}`);
        return true;
      } catch (e2) {
        results.push({ id, ok: false, detail: { first, afterFix: e2 instanceof Error ? e2.message : String(e2) } });
        log(`preflight FAIL ${id}: ${first}`);
        return false;
      }
    }
    results.push({ id, ok: false, detail: first });
    log(`preflight FAIL ${id}: ${first}`);
    return false;
  }
}

/** TCC auth_value for a service: 0 denied, 2 allowed, null = never asked. */
async function tccValue(udid: string, service: string, bundleId: string): Promise<number | null> {
  const dbPath = join(homedir(), "Library/Developer/CoreSimulator/Devices", udid, "data/Library/TCC/TCC.db");
  if (!existsSync(dbPath)) return null;
  const { stdout } = await run("sqlite3", [dbPath, `select auth_value from access where service='${service}' and client='${bundleId}'`]);
  const v = stdout.trim();
  return v === "" ? null : Number(v);
}

export async function preflight(d: PreflightDeps): Promise<CheckResult[]> {
  const r: CheckResult[] = [];
  const { cfg, idb, simctl } = d;

  await check(r, "config-safety", async () => "local only (checked at load)");
  await check(r, "supabase-auth-health", async () => {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/health`, { headers: { apikey: cfg.publishableKey } });
    if (!res.ok) throw new Error(`auth health ${res.status}`);
    return res.status;
  });
  await check(r, "db-select-1", async () => {
    if ((await psql("select 1")) !== "1") throw new Error("select 1 failed");
    return 1;
  });
  await check(
    r,
    "realtime-container-running",
    async () => {
      const { stdout } = await run("docker", ["inspect", "-f", "{{.State.Running}} {{.State.Paused}}", cfg.realtimeContainer]);
      if (stdout.trim() !== "true false") throw new Error(`realtime container state: ${stdout.trim()}`);
      return stdout.trim();
    },
    async () => {
      // A crashed E8 run can leave it paused.
      await run("docker", ["unpause", cfg.realtimeContainer]).catch(() => undefined);
    },
  );
  await check(r, "metro-running", async () => {
    const res = await fetch(`${cfg.metroUrl}/status`);
    const body = await res.text();
    if (!body.includes("packager-status:running")) throw new Error(`metro: ${body}`);
    return body;
  });
  await check(r, "metro-log-readable", async () => {
    const ok = !!cfg.metroLog && existsSync(cfg.metroLog);
    if (ok) return cfg.metroLog;
    if (cfg.requireMetroLog) {
      throw new Error("Metro log is required (requireMetroLog) but METRO_LOG / metroLog is unset or unreadable");
    }
    return "SKIPPED: no Metro log; every scenario will record logs:metro-clean as skipped";
  });
  await check(r, "sim-booted", async () => {
    if (!(await simctl.isBooted())) throw new Error(`simulator ${cfg.udid} not booted`);
    return cfg.udid;
  });
  await check(r, "app-installed", async () => {
    if (!(await simctl.isInstalled())) throw new Error(`${cfg.bundleId} not installed`);
    return cfg.bundleId;
  });
  const want = d.camera === "revoked" ? 0 : 2;
  await check(
    r,
    `camera-mic-${d.camera}`,
    async () => {
      const cam = await tccValue(cfg.udid, "kTCCServiceCamera", cfg.bundleId);
      const mic = await tccValue(cfg.udid, "kTCCServiceMicrophone", cfg.bundleId);
      if (cam !== want || mic !== want) throw new Error(`camera=${cam} microphone=${mic}, want ${want}`);
      return { cam, mic };
    },
    async () => {
      // Changing a permission terminates the app on iOS; relaunch after.
      await simctl.privacy(d.camera === "revoked" ? "revoke" : "grant", ["camera", "microphone"]);
      await simctl.launch();
      await idb.waitFor({ label: "ELO RATED" }, 30_000);
    },
  );
  await check(
    r,
    "app-foreground",
    async () => {
      const els = await idb.describe();
      const app = els.find((e) => e.type === "Application");
      if (app?.AXLabel !== "ELO RATED") throw new Error(`frontmost is ${app?.AXLabel ?? "nothing"}`);
      return app.AXLabel;
    },
    async () => {
      await simctl.launch();
      await new Promise((res) => setTimeout(res, 4_000));
    },
  );
  await check(r, "alert-sweep", async () => idb.dismissSystemAlerts());
  await check(r, "sim-signed-in-as-blue", async () => {
    const email = await d.ui.signedInEmail();
    if (email !== cfg.emails.blue) throw new Error(`simulator is signed in as ${email ?? "nobody"}; run --signin-blue (LOOP.md step 3)`);
    // Back out of settings to the tabs.
    await idb.tapQ({ label: "Go back", type: "Button" }, 5_000).catch(() => undefined);
    return email;
  });
  await check(r, "bot-signs-in-as-red + app-on-local-stack", () => proveAppOnLocalStack(cfg, d.ids, d.password));
  await check(r, "athletes-active", async () => {
    const rows = await queryJson<{ id: string; status: string }>(
      `select id, status from public.athletes where id in ('${d.ids.blue}','${d.ids.red}','${d.ids.green}')`,
    );
    const bad = rows.filter((x) => x.status !== "active");
    if (rows.length !== 3 || bad.length) throw new Error(`not active: ${JSON.stringify(bad)}`);
    return rows.length;
  });
  await check(r, "submission-types", async () => {
    const n = Number(await psql("select count(*) from public.submission_types"));
    if (!n) throw new Error("submission_types is empty");
    return n;
  });
  await check(r, "realtime-publication", async () => {
    // Informational: records whether H1 still holds.
    const rows = await psql("select string_agg(tablename, ',') from pg_publication_tables where pubname = 'supabase_realtime'");
    return { tables: rows, matchesPublished: rows.split(",").includes("matches") };
  });
  if (d.typecheck) {
    await check(r, "match-loop-typecheck", async () => {
      await run(join(REPO_ROOT, "node_modules/.bin/tsc"), ["-p", join(REPO_ROOT, "tools/match-loop")], { timeoutMs: 180_000 });
      return "clean";
    });
  }
  return r;
}

/** LOOP.md step 3: sign the simulator in as Demo Blue through the UI. */
export async function signInBlue(d: Pick<PreflightDeps, "cfg" | "ui" | "idb" | "simctl" | "password" | "ids">): Promise<void> {
  const { ui, idb, simctl, cfg } = d;
  // Never type the password into an app that might be pointed elsewhere:
  // re-run the static local-only guard right before sign-in.
  assertSafe(cfg);
  const email = await ui.signedInEmail();
  if (email === cfg.emails.blue) {
    log(`simulator already signed in as ${email}`);
    await idb.tapQ({ label: "Go back", type: "Button" }, 5_000).catch(() => undefined);
    return;
  }
  // Remember who was signed in so we can verify their live flag was cleared.
  const prev = email
    ? (
        await queryJson<{ id: string }>(
          `select a.id from public.athletes a join auth.users u on u.id = a.auth_user_id where lower(u.email) = '${email.replace(/'/g, "''")}'`,
        )
      )[0]?.id
    : undefined;
  try {
    if (email) await ui.signOut();
  } catch (e) {
    log(`UI sign-out failed (${e instanceof Error ? e.message : e}); resetting the keychain`);
    await simctl.terminate();
    await simctl.keychainReset();
    await simctl.launch();
    await idb.waitFor({ id: "login-email" }, 30_000);
  }
  await ui.signIn(cfg.emails.blue, d.password);
  if (prev) {
    const row = (await queryJson<{ looking_for_ranked: boolean }>(`select looking_for_ranked from public.athletes where id = '${prev}'`))[0];
    log(`previous user ${email} looking_for_ranked after sign-out: ${row?.looking_for_ranked}`);
  }
}
