import { describe, expect, it } from "vitest";
import { errorPageCopy } from "./error-copy";

describe("errorPageCopy", () => {
  it("locked: goes home and never mentions signing in", () => {
    expect(errorPageCopy(false)).toEqual({
      message: "Something unexpected happened. Please try again.",
      backHref: "/",
      backLabel: "Back to ELO RATED",
    });
    expect(errorPageCopy(false, "access_denied").message).toBe("Access was denied. Please try again.");
    expect(errorPageCopy(false, "server_error").message).toBe("Something went wrong on our end. Please try again in a moment.");
    expect(errorPageCopy(false, "nope").message).toBe("Something unexpected happened. Please try again.");
  });

  it("unlocked: today's copy and the sign-in button", () => {
    expect(errorPageCopy(true)).toEqual({
      message: "Something unexpected happened. Please try signing in again.",
      backHref: "/login",
      backLabel: "Back to sign in",
    });
    expect(errorPageCopy(true, "access_denied").message).toBe("Access was denied. Please try signing in again.");
    expect(errorPageCopy(true, "validation_failed").message).toBe("There was a problem with your request. Please try again.");
  });
});
