import { describe, expect, it } from "vitest";
import { detectInAppBrowser, isLinkPreviewCrawler } from "./user-agent";

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("detectInAppBrowser", () => {
  it.each([
    [`${SAFARI} Instagram 350.0.0.0 (iPhone15,2; iOS 18_0)`, "instagram"],
    [`${SAFARI} [FBAN/FBIOS;FBAV/480.0;FBBV/1]`, "facebook"],
    [`${SAFARI} [FBAN/MessengerForiOS;FBAV/470.0]`, "messenger"],
    [`${SAFARI} Snapchat/13.0`, "other"],
    [SAFARI, null],
    ["", null],
    [null, null],
  ])("%s -> %s", (ua, expected) => {
    expect(detectInAppBrowser(ua)).toBe(expected);
  });
});

describe("isLinkPreviewCrawler", () => {
  it.each([
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0)",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0",
    "LinkedInBot/1.0",
    "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (Applebot/0.1)",
    "com.apple.Safari.SearchHelper",
  ])("%s is a crawler", (ua) => {
    expect(isLinkPreviewCrawler(ua)).toBe(true);
  });

  it("a phone browser is not", () => {
    expect(isLinkPreviewCrawler(SAFARI)).toBe(false);
    expect(isLinkPreviewCrawler(null)).toBe(false);
  });
});
