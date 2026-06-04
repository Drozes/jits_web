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
 * CHUNKED WRITES: SecureStore warns when a single value exceeds ~2048 bytes,
 * and the Supabase auth session payload (access_token + refresh_token + user
 * metadata) routinely crosses that line. Instead of the heavier
 * encrypt-to-AsyncStorage `LargeSecureStore` pattern, we split the value into
 * sub-limit chunks across keys `${key}.0`, `${key}.1`, ... and store the chunk
 * count under a meta key (`${key}.meta`). `getItem` reads the count and
 * reassembles every chunk in order, so the Supabase client always gets the
 * full session string back. This stays a pure, drop-in async storage adapter:
 * the client config (processLock + the synchronous `onAuthStateChange`
 * callback in `auth-context.tsx`) is untouched, and `getItem` resolves with
 * the complete value, so the cold-start auth gate cannot wedge on a partial
 * read (see fix 322039e).
 *
 * MIGRATION: a legacy build wrote the whole session to a single `${key}`
 * entry. `getItem` falls back to that single value when no meta key exists, so
 * already-signed-in users are not logged out; the next `setItem` rewrites the
 * value chunked and deletes the legacy single key.
 */

// Native SecureStore warns above 2048 bytes per value. Chunk well under that
// so a multi-byte UTF-8 character can never straddle the limit on the last
// byte of a chunk (worst case a single code point is 4 bytes).
const MAX_CHUNK_BYTES = 2000;

const metaKey = (key: string): string => `${key}.meta`;
const chunkKey = (key: string, index: number): string => `${key}.${index}`;

const utf8ByteLength = (value: string): number =>
  // TextEncoder is available in the Hermes/RN runtime and under jsdom in tests.
  typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(value).length
    : // Fallback: count UTF-8 bytes without allocating an encoder.
      unescape(encodeURIComponent(value)).length;

/**
 * Split `value` into chunks each at most `MAX_CHUNK_BYTES` UTF-8 bytes.
 * Splits on code-point boundaries (via the spread iterator) so a multi-byte
 * character is never cut in half; reassembling the chunks in order yields the
 * exact original string.
 */
const splitIntoChunks = (value: string): string[] => {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const codePoint of value) {
    const cpBytes = utf8ByteLength(codePoint);
    if (currentBytes + cpBytes > MAX_CHUNK_BYTES && current.length > 0) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += codePoint;
    currentBytes += cpBytes;
  }
  if (current.length > 0) chunks.push(current);
  // An empty string still round-trips as a single empty chunk.
  return chunks.length > 0 ? chunks : [""];
};

export const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    }

    const countRaw = await SecureStore.getItemAsync(metaKey(key));
    if (countRaw === null) {
      // No chunk metadata: either nothing stored, or a legacy single-key value
      // written before chunking existed. Return the legacy value so existing
      // signed-in users keep their session (it gets re-chunked on next set).
      return SecureStore.getItemAsync(key);
    }

    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A missing chunk means the stored value is corrupt/incomplete; treat the
      // whole entry as absent rather than returning a partial session.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      return;
    }

    const chunks = splitIntoChunks(value);

    // How many chunks did the previous value occupy? Used to clean up any
    // now-orphaned higher-index chunks when the value shrinks.
    const prevCountRaw = await SecureStore.getItemAsync(metaKey(key));
    const prevCount = prevCountRaw !== null ? Number.parseInt(prevCountRaw, 10) : 0;

    // Write every chunk, then the count last so a crash mid-write leaves the
    // meta key pointing only at fully-written chunks (getItem returns null on a
    // missing chunk anyway).
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));

    // Remove leftover chunks from a previously longer value.
    for (let i = chunks.length; i < prevCount; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }

    // Drop any legacy single-key value now that the chunked copy is canonical.
    if ((await SecureStore.getItemAsync(key)) !== null) {
      await SecureStore.deleteItemAsync(key);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
      return;
    }

    const countRaw = await SecureStore.getItemAsync(metaKey(key));
    const count = countRaw !== null ? Number.parseInt(countRaw, 10) : 0;
    for (let i = 0; i < count; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(metaKey(key));
    // Also clear any legacy single-key value so sign-out leaves no orphans.
    await SecureStore.deleteItemAsync(key);
  },
};
