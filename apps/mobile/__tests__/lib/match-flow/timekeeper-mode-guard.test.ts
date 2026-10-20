/**
 * Clean-code guard for the two match modes (timekeeper mode ARCHITECTURE 5):
 *
 *  - M-R1: no read of `requires_timekeeper` in the app outside
 *    `lib/match-flow/match-roles.ts`;
 *  - M-R2: no "me / the other one" pair derived from the participant array
 *    under `components/match-flow/` or `lib/match-flow/`, again outside
 *    `match-roles.ts`. Everything reads `MatchRoles` instead;
 *  - M-R4 (spec 14.9 X1): no timekeeper-mode surface renders a DomainError's
 *    `message`. Those messages are the copy deck's words only where the deck
 *    has words for the refusal on its own (`api/timekeeper.ts`
 *    `TIMEKEEPER_DECK_MESSAGES`); a timekeeper-mode screen shows the deck
 *    string for `error.code` from `timekeeper-copy.ts`, with its names.
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

/**
 * M-R1: any read of the mode key: a property read, a destructured or
 * object key, and (jits-o47s.26) a quoted name (`m["requires_timekeeper"]`,
 * `"requires_timekeeper" in m`).
 */
const MODE_READ = /\.requires_timekeeper\b|\brequires_timekeeper\s*[,}:=]|["'`]requires_timekeeper["'`]/;

/**
 * M-R1 across lines: the mode key inside any braces, matched against the
 * whole file. It catches a destructure that spans lines with the key last and
 * no trailing comma (`const {\n  status,\n  requires_timekeeper\n} = match;`,
 * whose key line the line scan cannot see), a destructured parameter, and a
 * type or object literal naming the key. Unlike `participants`, no component
 * prop is called `requires_timekeeper`, so nothing legitimate is caught.
 */
const MODE_IN_BRACES = /\{[^{}]*\brequires_timekeeper\b[^{}]*\}/;

/**
 * M-R2: any read of the match's participant array (jits-o47s.26): a property
 * read (`.find`, `[1]`, `for...of`, `.map(...).find`, an array destructure),
 * a one-line object destructure, a quoted key, a bare `participants.find`
 * style pairing, and a loose or strict "not me" comparison on athlete_id.
 * A component's own `participants` prop (result-step-fields.tsx) is not the
 * match's array and is not flagged.
 */
const PARTICIPANT_READ =
  /\.participants\b|\{[^}]*\bparticipants\b[^}]*\}\s*=(?!=)|\[\s*["'`]participants["'`]\s*\]|\bparticipants\s*\.\s*(find|findIndex|filter|some|every)\s*\(|\bathlete_id\s*!=/;

/**
 * M-R2 across lines: an object destructure of `participants` that spans
 * lines (`const {\n  participants,\n} = match;`, then `participants[1]`),
 * which the line scan cannot see because a bare `participants,` line is also
 * a component prop's. Matched against the whole file; a destructured
 * parameter (`({ participants }: Props)`) is not an assignment and passes.
 */
const MULTILINE_DESTRUCTURE = /\{[^}]*\bparticipants\b[^}]*\}\s*=(?!=)/;

function fileOffenders(dirs: string[], pattern: RegExp): string[] {
  return dirs
    .flatMap(sources)
    .filter((rel) => rel !== ROLES_FILE && pattern.test(readFileSync(join(APP, rel), "utf8")));
}

/**
 * M-R4: a timekeeper-mode surface, by what it imports (the timekeeper-mode
 * wrappers or copy) or by its path (the crew step, the timekeep route, the
 * timekeeper's face-off and done screen, the admin review screens, the
 * timekeeper-mode hooks).
 */
const TK_SURFACE_IMPORT = /from\s+["'](?:@jits\/shared\/api\/timekeeper|[^"']*timekeeper-copy)["']/;
const TK_SURFACE_PATH =
  /(^|\/)(crew\/|timekeep\.tsx$|faceoff-timekeeper\.tsx$|timekeeper-[\w-]+\.tsx?$|use-timekeeper-[\w-]+\.ts$|use-crew-[\w-]+\.ts$)/;
/** M-R4: a read of an error's `message` (`res.error.message`, `err?.message`, `(e as Error).message`). */
const ERROR_MESSAGE = /\b(?:error|err|e)\??\.message\b|\)\??\.message\b/;

function timekeeperSurfaces(dirs: string[]): string[] {
  return dirs
    .flatMap(sources)
    .filter((rel) => TK_SURFACE_PATH.test(rel) || TK_SURFACE_IMPORT.test(readFileSync(join(APP, rel), "utf8")));
}

describe("timekeeper mode guard", () => {
  it("M-R1: only match-roles.ts reads requires_timekeeper", () => {
    expect(offenders(["app", "components", "lib"], MODE_READ)).toEqual([]);
    expect(fileOffenders(["app", "components", "lib"], MODE_IN_BRACES)).toEqual([]);
  });

  it("M-R2: no participant pair is derived outside match-roles.ts", () => {
    expect(offenders(["components/match-flow", "lib/match-flow"], PARTICIPANT_READ)).toEqual([]);
    expect(fileOffenders(["components/match-flow", "lib/match-flow"], MULTILINE_DESTRUCTURE)).toEqual([]);
  });

  it("the patterns catch every known way around them (jits-o47s.26)", () => {
    const modeReads = [
      "if (match.requires_timekeeper) {",
      "const mode = match.requires_timekeeper ?? false;",
      "const { requires_timekeeper } = match;",
      "const { requires_timekeeper: tk } = match;",
      'const tk = match["requires_timekeeper"];',
      "const tk = m['requires_timekeeper'];",
      'if ("requires_timekeeper" in match) {',
    ];
    for (const line of modeReads) expect([line, MODE_READ.test(line)]).toEqual([line, true]);

    const pairs = [
      "const theirs = match.participants.find((p) => p.athlete_id !== me);",
      "const theirs = match.participants[1];",
      "const [a, b] = match.participants;",
      "for (const p of match.participants) {",
      "const ids = match.participants.map((p) => p.athlete_id).find((id) => id !== me);",
      "const { participants } = match;",
      "const { participants: ps } = details;",
      'const ps = match["participants"];',
      "const other = participants.find((p) => p.athlete_id != me);",
      "if (p.athlete_id != viewerId) {",
    ];
    for (const line of pairs) expect([line, PARTICIPANT_READ.test(line)]).toEqual([line, true]);

    const allowed = [
      "  participants,",
      "  participants: ResultParticipant[];",
      "        {participants.map((p) => {",
      "  // RLS limits the feed to participants. One",
      "if (p.athlete_id === viewerId) {",
      "const requiresTimekeeper = roles.mode === \"timekeeper\";",
    ];
    for (const line of allowed) {
      expect([line, PARTICIPANT_READ.test(line) || MODE_READ.test(line)]).toEqual([line, false]);
    }

    // Across lines, the mode key: a destructure with the key last and no
    // trailing comma (the line scan misses it), a destructured parameter, and
    // a type literal are caught; a read of the roles is not.
    const lastKeyNoComma = "const {\n  status,\n  requires_timekeeper\n} = match;\nif (requires_timekeeper) {";
    expect(lastKeyNoComma.split("\n").some((line) => MODE_READ.test(line))).toBe(false);
    expect(MODE_IN_BRACES.test(lastKeyNoComma)).toBe(true);
    expect(MODE_IN_BRACES.test("function isTk({\n  id,\n  requires_timekeeper\n}: MatchDetails) {")).toBe(true);
    expect(MODE_IN_BRACES.test("type Row = {\n  requires_timekeeper?: boolean\n};")).toBe(true);
    expect(MODE_IN_BRACES.test('const { mode } = roles;\nif (mode === "timekeeper") {\n  start();\n}')).toBe(false);

    // Across lines: an assignment destructure is caught, a destructured parameter is not.
    expect(MULTILINE_DESTRUCTURE.test("const {\n  status,\n  participants,\n} = match;\nconst b = participants[1];")).toBe(true);
    expect(MULTILINE_DESTRUCTURE.test("export function WinnerPicker({\n  participants,\n  winnerId,\n}: {\n  participants: P[];\n}) {")).toBe(
      false,
    );
  });

  it("M-R4: no timekeeper-mode surface renders a DomainError's message", () => {
    const surfaces = timekeeperSurfaces(["app", "components", "lib"]);
    const found = surfaces.flatMap((rel) =>
      readFileSync(join(APP, rel), "utf8")
        .split("\n")
        .flatMap((line, i) => (ERROR_MESSAGE.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(found).toEqual([]);
  });

  it("M-R4: the surface and message patterns catch what they guard", () => {
    const surfaces = timekeeperSurfaces(["app", "components", "lib"]);
    for (const rel of [
      join("components/match-flow/crew", "crew-step.tsx"),
      join("components/match-flow/faceoff", "faceoff-timekeeper.tsx"),
      join("components/match-flow/steps", "timekeeper-done.tsx"),
      "app/(app)/match/[matchId]/timekeep.tsx",
      "lib/match-flow/use-timekeeper-state.ts",
      "lib/match-flow/use-crew-leave.ts",
      "lib/match-flow/step-seams.ts",
    ]) {
      expect([rel, surfaces.includes(rel)]).toEqual([rel, true]);
    }
    // The shipped two-athlete steps are not timekeeper-mode surfaces.
    expect(surfaces).not.toContain(join("components/match-flow/steps", "confirm-step.tsx"));
    for (const line of [
      'toast.error({ text1: "x", description: res.error.message });',
      "Alert.alert(err.message);",
      "setText(result.error?.message ?? \"\");",
      "const text = (e as Error).message;",
      "return error.message;",
    ]) {
      expect([line, ERROR_MESSAGE.test(line)]).toEqual([line, true]);
    }
    for (const line of [
      'if (res.error.code === "REQUEST_CLOSED") show(TIMEKEEPER_COPY["TK-T6"]);',
      "const messageId = 4;",
      "// the message is the deck string",
    ]) {
      expect([line, ERROR_MESSAGE.test(line)]).toEqual([line, false]);
    }
    expect(TK_SURFACE_IMPORT.test('import { getTimekeeperMatchState } from "@jits/shared/api/timekeeper";')).toBe(true);
    expect(TK_SURFACE_IMPORT.test('import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";')).toBe(true);
    expect(TK_SURFACE_IMPORT.test('import { getMatchDetails } from "@jits/shared/api/queries";')).toBe(false);
  });

  it("the scan covers the files it guards", () => {
    expect(sources("lib/match-flow")).toContain(ROLES_FILE);
    expect(sources("components/match-flow")).toContain(join("components/match-flow", "match-flow-wizard.tsx"));
  });
});
