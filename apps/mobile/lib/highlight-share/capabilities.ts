import { Linking, Platform } from "react-native";
import { isReelsShareSupported } from "@/modules/instagram-reels";
import { env } from "@/lib/env";
import { hasNativeModule, loadClipboardNative, loadSharing } from "./native-modules";

/**
 * What this binary and device can do for the share funnel (jr_be spec 015
 * section 16.6.1). `reels`, `shareSheet`, `saveToPhotos`, `clipboard` and
 * `facebookAppIdConfigured` are the spec's five; `reelsModule` and
 * `instagramDetected` are the raw inputs, for the admin diagnostics row.
 */
export interface ShareCapabilities {
  reels: boolean;
  shareSheet: boolean;
  saveToPhotos: boolean;
  clipboard: boolean;
  facebookAppIdConfigured: boolean;
  /** The InstagramReels native module is in this binary (and the platform is iOS/Android). */
  reelsModule: boolean;
  /** iOS: `canOpenURL("instagram-reels://share")`. Android: null (no pre-check; the handoff is attempted). */
  instagramDetected: boolean | null;
}

export const INSTAGRAM_REELS_URL = "instagram-reels://share";

async function detectInstagram(): Promise<boolean | null> {
  if (Platform.OS !== "ios") return null;
  try {
    return await Linking.canOpenURL(INSTAGRAM_REELS_URL);
  } catch {
    return false;
  }
}

async function detectShareSheet(): Promise<boolean> {
  const sharing = loadSharing();
  if (!sharing) return false;
  try {
    return (await sharing.isAvailableAsync()) === true;
  } catch {
    return false;
  }
}

/**
 * Never throws. `reels` needs the native module, a configured App ID and,
 * on iOS, Instagram answering `canOpenURL` (the `instagram-reels` query
 * scheme is declared by `plugins/with-instagram-reels.js`).
 */
export async function getShareCapabilities(): Promise<ShareCapabilities> {
  const reelsModule = isReelsShareSupported;
  const facebookAppIdConfigured = env.facebookAppId !== null;
  const [instagramDetected, shareSheet] = await Promise.all([detectInstagram(), detectShareSheet()]);
  const instagramOk = Platform.OS === "ios" ? instagramDetected === true : true;
  return {
    reels: reelsModule && facebookAppIdConfigured && instagramOk,
    shareSheet,
    saveToPhotos: hasNativeModule("ExpoMediaLibrary"),
    clipboard: loadClipboardNative() !== null,
    facebookAppIdConfigured,
    reelsModule,
    instagramDetected,
  };
}
