import type { ConfigPlugin } from "expo/config-plugins";

/**
 * Types for the CommonJS config plugin. The plugin itself stays `.js`
 * because Expo's prebuild loads it with plain `require` at config time,
 * well before any TypeScript transform this app configures. Same shape as
 * `with-android-backup-rules.d.ts`.
 */
declare const withInstagramReels: ConfigPlugin;

export default withInstagramReels;

/** The iOS `LSApplicationQueriesSchemes` entries this plugin guarantees. */
export declare const QUERIED_SCHEMES: readonly string[];
/** The Android package declared in `<queries>`. */
export declare const INSTAGRAM_PACKAGE: string;

/**
 * The Info.plist half, as a pure function over the parsed plist, so the
 * test can assert it without a prebuild. Additive and idempotent.
 */
export declare function addQueriedSchemes<T extends { LSApplicationQueriesSchemes?: string[] }>(
  infoPlist: T,
): T;

/**
 * The AndroidManifest half, likewise. Typed structurally rather than
 * against `AndroidConfig.Manifest.AndroidManifest` so the test can hand it
 * a minimal fixture, which is what keeps the assertion readable.
 */
export declare function addInstagramPackageQuery<
  T extends {
    manifest: {
      queries?: { package?: { $: { "android:name": string } }[] }[];
    };
  },
>(androidManifest: T): T;
