/**
 * VoiceOver / TalkBack announcements for the go-live flow (UX 019, section
 * 4, "Announcements"): "You're live" once when the chip turns green after a
 * tap (never on a restore), "Finding your location" once when FINDING YOU
 * lasts over a second, "Reconnecting" once on entering RECONNECTING, and
 * "You're offline" on a manual go-offline. Never throws.
 */
import { AccessibilityInfo } from "react-native";

export const ANNOUNCE_LIVE = "You're live";
export const ANNOUNCE_FINDING = "Finding your location";
export const ANNOUNCE_RECONNECTING = "Reconnecting";
export const ANNOUNCE_OFFLINE = "You're offline";

export function announce(text: string): void {
  try {
    AccessibilityInfo.announceForAccessibility?.(text);
  } catch {
    // Accessibility only: never reach the flow.
  }
}
