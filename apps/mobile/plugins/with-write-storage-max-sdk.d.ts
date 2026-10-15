import type { ConfigPlugin } from "expo/config-plugins";

/** Types for the CommonJS config plugin (same shape as with-android-backup-rules.d.ts). */
declare const withWriteStorageMaxSdk: ConfigPlugin;

export default withWriteStorageMaxSdk;

export declare const PERMISSION: string;
export declare const MAX_SDK: string;
/** The manifest half, as a pure function, so it can be asserted directly. */
export declare function capWriteExternalStorage<T>(androidManifest: T): T;
