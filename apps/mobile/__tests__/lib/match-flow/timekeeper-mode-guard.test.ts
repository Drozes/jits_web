/**
 * Clean-code guard for the two match modes (timekeeper mode ARCHITECTURE 5):
 *
 *  - M-R1: no read of `requires_timekeeper` in the app outside
 *    `lib/match-flow/match-roles.ts`;
 *  - M-R2: no "me / the other one" pair derived from the participant array
 *    under `components/match-flow/` or `lib/match-flow/`, again outside
 *    `match-roles.ts`. Everything reads `MatchRoles` instead.
 *
 * Source scan, like the other guards in this repo: a new inline derivation
 * fails here until it goes through `deriveMatchRoles`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..", "..");
const ROLES_FILE = "lib/match-flow/match-roles.ts";

function sources(dir: string): string[] {
  return readdirSync(join(APP, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(APP, rel)).isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

function offenders(dirs: string[], pattern: RegExp): string[] {
  return dirs
    .flatMap(sources)
    .filter((rel) => rel !== ROLES_FILE)
    .flatMap((rel) =>
      readFileSync(join(APP, rel), "utf8")
        .split("\n")
        .flatMap((line, i) => (pattern.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : [])),
    );
}

describe("timekeeper mode guard", () => {
  it("M-R1: only match-roles.ts reads requires_timekeeper", () => {
    expect(offenders(["app", "components", "lib"], /\.requires_timekeeper\b|\brequires_timekeeper\s*[,}:=]/)).toEqual([]);
  });

  it("M-R2: no participant pair is derived outside match-roles.ts", () => {
    const pair = /\bparticipants\s*\.\s*(find|findIndex|filter|some|every)\s*\(|\bathlete_id\s*!==/;
    expect(offenders(["components/match-flow", "lib/match-flow"], pair)).toEqual([]);
  });

  it("the scan covers the files it guards", () => {
    expect(sources("lib/match-flow")).toContain(ROLES_FILE);
    expect(sources("components/match-flow")).toContain(join("components/match-flow", "match-flow-wizard.tsx"));
  });
});
