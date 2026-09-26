import { describe, it, expect, beforeEach } from "vitest";
import {
  LEFT_MATCHES_COOKIE,
  LEFT_MATCHES_MAX,
  arenaMatchIdFromPath,
  parseLeftMatches,
  rememberLeftMatch,
} from "./left-matches";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const M1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

function cookieValue(): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LEFT_MATCHES_COOKIE) return rest.join("=");
  }
  return undefined;
}

beforeEach(() => {
  document.cookie = `${LEFT_MATCHES_COOKIE}=; path=/; max-age=0`;
});

describe("arenaMatchIdFromPath", () => {
  it("reads the id of an Arena match route only", () => {
    expect(arenaMatchIdFromPath(`/arena/match/${M1}`)).toBe(M1);
    expect(arenaMatchIdFromPath(`/arena/match/${M1}/anything`)).toBe(M1);
    expect(arenaMatchIdFromPath("/arena")).toBeNull();
    expect(arenaMatchIdFromPath(`/session/s1/match/${M1}`)).toBeNull();
    expect(arenaMatchIdFromPath("/arena/match/not-a-uuid")).toBeNull();
    expect(arenaMatchIdFromPath(null)).toBeNull();
  });
});

describe("parseLeftMatches", () => {
  it("returns the ids for this athlete only, dropping anything that is not a UUID", () => {
    const value = encodeURIComponent(`${ME}:${M1},junk,${M2}`);
    expect(parseLeftMatches(value, ME)).toEqual([M1, M2]);
    expect(parseLeftMatches(value, OTHER)).toEqual([]);
    expect(parseLeftMatches(undefined, ME)).toEqual([]);
    expect(parseLeftMatches("%E0%A4%A", ME)).toEqual([]);
  });
});

describe("rememberLeftMatch", () => {
  it("adds ids once, newest last", () => {
    rememberLeftMatch(ME, M1);
    rememberLeftMatch(ME, M2);
    rememberLeftMatch(ME, M1);
    expect(parseLeftMatches(cookieValue(), ME)).toEqual([M2, M1]);
  });

  it("starts over for a different athlete", () => {
    rememberLeftMatch(OTHER, M1);
    rememberLeftMatch(ME, M2);
    expect(parseLeftMatches(cookieValue(), ME)).toEqual([M2]);
    expect(parseLeftMatches(cookieValue(), OTHER)).toEqual([]);
  });

  it("keeps at most the newest LEFT_MATCHES_MAX ids", () => {
    for (let i = 0; i < LEFT_MATCHES_MAX + 5; i++) rememberLeftMatch(ME, uuid(i));
    const ids = parseLeftMatches(cookieValue(), ME);
    expect(ids).toHaveLength(LEFT_MATCHES_MAX);
    expect(ids.at(-1)).toBe(uuid(LEFT_MATCHES_MAX + 4));
  });

  it("ignores an id that is not a UUID", () => {
    rememberLeftMatch(ME, "nope");
    expect(cookieValue()).toBeFalsy();
  });
});
