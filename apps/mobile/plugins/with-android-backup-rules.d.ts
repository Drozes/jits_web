import type { ConfigPlugin } from "expo/config-plugins";

/**
 * Types for the CommonJS config plugin. The plugin itself stays `.js`
 * because Expo's prebuild loads it with plain `require` at config time,
 * well before any TypeScript transform this app configures.
 */
declare const withAndroidBackupRules: ConfigPlugin;

export default withAndroidBackupRules;

/** API 31+ rules, exported so the test can assert the XML. */
export declare const DATA_EXTRACTION_RULES: string;
/** API 23-30 rules, exported so the test can assert the XML. */
export declare const FULL_BACKUP_CONTENT: string;
/** The excluded directory, kept in step with `RETAINED_DIR_NAME`. */
export declare const DIRECTORY: string;
/** The manifest half, as a pure function, so it can be asserted directly. */
export declare function setBackupAttributes<T>(androidManifest: T): T;
