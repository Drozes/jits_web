import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * jr_be `20261001300700` (M2): every client INSERT into `public.matches` is
 * refused with HINT `match_insert_server_only`. Matches come only from
 * `start_match_from_challenge` and other SECURITY DEFINER paths, so no web
 * source may insert or upsert into `matches` directly.
 */
const WEB_ROOT = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", "e2e", "outside_assets", "public"]);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no direct match insert on web", () => {
  it("no source writes rows into matches via from('matches').insert/upsert", () => {
    const offenders = sources(WEB_ROOT).filter((file) => {
      const text = readFileSync(file, "utf8");
      // A from("matches") chain that reaches .insert( or .upsert( before the
      // statement ends.
      return /\.from\(\s*["'`]matches["'`]\s*\)[^;]*?\.(insert|upsert)\s*\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("the scan does see the web sources (guards against a vacuous pass)", () => {
    const files = sources(WEB_ROOT);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => readFileSync(f, "utf8").includes('.from("matches")'))).toBe(true);
  });
});
