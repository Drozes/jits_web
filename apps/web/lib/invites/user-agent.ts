import type { InAppBrowser } from "./types";

/**
 * Link-preview crawlers (contract 6). They fetch the landing page to build a
 * card, so they must not count as a landing view.
 */
const CRAWLER_RE =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Applebot|com\.apple\./i;

export function isLinkPreviewCrawler(ua: string | null | undefined): boolean {
  return !!ua && CRAWLER_RE.test(ua);
}

/**
 * Which in-app browser (if any) is rendering the page. Instagram and the
 * Facebook apps cannot hand a universal link to the installed app, so the
 * page shows an "Open in Safari" hint inside them.
 */
export function detectInAppBrowser(ua: string | null | undefined): InAppBrowser {
  if (!ua) return null;
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN\/Messenger|MessengerForiOS|Orca-Android/i.test(ua)) return "messenger";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "facebook";
  if (/\bLine\/|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|LinkedInApp|GSA\//i.test(ua)) {
    return "other";
  }
  return null;
}
