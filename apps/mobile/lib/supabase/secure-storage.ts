import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// On web there is no native SecureStore module, so fall back to localStorage.
// Native (iOS/Android) is unchanged and continues to use expo-secure-store.
const isWeb = Platform.OS === "web";

/**
 * Storage adapter for Supabase auth that wraps `expo-secure-store`.
 *
 * Supabase's `SupportedStorage` type accepts async `getItem`/`setItem`/
 * `removeItem`, so we wrap each SecureStore call directly.
 *
 * NOTE: SecureStore values are limited to ~2048 bytes per key. The
 * Supabase auth session payload (access_token + refresh_token + user
 * metadata) typically fits, but if it grows we'll need a `LargeSecureStore`
 * pattern that encrypts the payload with an AES key in SecureStore and
 * stores the ciphertext in AsyncStorage. Tracked as a known issue in
 * Phase 2 A1 deliverable; revisit if `setItemAsync` ever throws
 * "value too large".
 */
export const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
