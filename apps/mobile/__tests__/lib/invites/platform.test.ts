/**
 * invitePlatform() maps the OS to the invite attribution platform
 * (jits-mafl.1, M1). "android" needs jr_be 20261015100000 on prod.
 *
 * Source: apps/mobile/lib/invites/platform.ts
 */
import { Platform } from "react-native";
import { invitePlatform } from "@/lib/invites/platform";

describe("invitePlatform", () => {
  it("maps android, ios and anything else to web", () => {
    expect(invitePlatform("android")).toBe("android");
    expect(invitePlatform("ios")).toBe("ios");
    expect(invitePlatform("web")).toBe("web");
    expect(invitePlatform("windows")).toBe("web");
  });

  it("reads Platform.OS by default", () => {
    expect(invitePlatform()).toBe(Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web");
  });
});
