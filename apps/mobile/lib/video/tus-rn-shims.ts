import AsyncStorage from "@react-native-async-storage/async-storage";
import { File as FsFile } from "expo-file-system";

/**
 * React Native compatibility shims for tus-js-client.
 *
 * tus-js-client's browser build assumes two things React Native does not
 * have:
 *
 *   1. a `File`/`Blob` with a synchronous, cheap `slice()` to cut chunks
 *      from (its `FileSource`), and
 *   2. `localStorage` to remember upload URLs across attempts (its
 *      `WebStorageUrlStorage`).
 *
 * Neither exists on RN, and its built-in RN fallback is worse than nothing
 * for our sizes: `fileReader.openFile` detects React Native and pulls the
 * WHOLE `file://` URI into a Blob via XHR before slicing it. For a 10-minute
 * match clip that is 300-600 MB resident before the first byte leaves the
 * device, which is exactly the memory profile that made the old base64 path
 * unusable. So we supply both pieces ourselves.
 */

/**
 * A chunk handed to the HTTP stack. React Native's `XMLHttpRequest.send()`
 * accepts `ArrayBuffer` and typed arrays (it base64-encodes them for the
 * bridge in `convertRequestBody`), so a `Uint8Array` is a valid body.
 *
 * `size` is NOT decoration. tus reads `value?.size` in `_addChunkToRequest`
 * and, on the final chunk, rejects the whole upload with "the source is done
 * after N bytes" when that total does not match the configured upload size.
 * A bare `Uint8Array` has `byteLength`/`length` but no `size`, so every
 * upload would fail on its last chunk.
 */
export type TusChunkValue = Uint8Array & { readonly size: number };

export interface TusSliceResult {
  value: TusChunkValue;
  done: boolean;
}

export interface TusFileSource {
  size: number;
  slice(start: number, end: number): Promise<TusSliceResult>;
  close(): void;
}

/** What we hand tus as its "file". Not a `File`; the reader below knows it. */
export interface TusFileInput {
  uri: string;
  size: number;
}

/** Tag a chunk with the `size` tus needs, without copying it. */
function withSize(bytes: Uint8Array): TusChunkValue {
  Object.defineProperty(bytes, "size", {
    value: bytes.byteLength,
    enumerable: false,
    writable: false,
  });
  return bytes as TusChunkValue;
}

/**
 * Reads 6 MB windows out of a local recording on demand.
 *
 * Uses expo-file-system's `FileHandle` (`offset` + `readBytes`) rather than
 * the legacy base64 `readAsStringAsync({ position, length })`: `readBytes`
 * returns a `Uint8Array` straight from native with no base64 round trip, so
 * a 6 MB chunk costs 6 MB of JS heap for the life of one request instead of
 * 6 MB of bytes plus an 8 MB base64 string plus the decode.
 *
 * The handle is opened lazily on the first `slice()` and held open for the
 * life of the upload attempt, because tus reads strictly forward and
 * re-opening per chunk would be ~100 native calls on a 600 MB file. A failed
 * attempt closes it; the next attempt opens a fresh one.
 */
export class ExpoFileSource implements TusFileSource {
  readonly size: number;
  private readonly uri: string;
  private handle: ReturnType<FsFile["open"]> | null = null;
  private closed = false;

  constructor(input: TusFileInput) {
    this.uri = input.uri;
    this.size = input.size;
  }

  private open(): ReturnType<FsFile["open"]> {
    if (this.closed) throw new Error("tus: file source was already closed");
    if (!this.handle) this.handle = new FsFile(this.uri).open();
    return this.handle;
  }

  async slice(start: number, end: number): Promise<TusSliceResult> {
    // tus can pass an `end` past EOF (its chunk window is unconditional) and,
    // on a retry, the same window twice. Both are handled by clamping and by
    // seeking absolutely rather than relying on the handle's own cursor.
    const from = Math.max(0, Math.min(start, this.size));
    const to = Math.max(from, Math.min(end, this.size));
    const length = to - from;

    if (length === 0) {
      // A zero-length read at EOF is a legitimate "nothing left": report it
      // as done so tus finishes instead of looping on empty PATCHes.
      return { value: withSize(new Uint8Array(0)), done: from >= this.size };
    }

    const handle = this.open();
    handle.offset = from;
    const bytes = handle.readBytes(length);
    // `done` is computed from what we actually read, not from the requested
    // window: a short read at EOF must still terminate the upload.
    return { value: withSize(bytes), done: from + bytes.byteLength >= this.size };
  }

  close(): void {
    this.closed = true;
    const handle = this.handle;
    this.handle = null;
    if (!handle) return;
    try {
      handle.close();
    } catch {
      // A handle whose file was deleted under us throws on close. The upload
      // is over either way; a throw here would mask its real outcome.
    }
  }
}

/** tus `FileReader` that understands our `{ uri, size }` input. */
export class ExpoFileReader {
  async openFile(input: TusFileInput, _chunkSize: number): Promise<TusFileSource> {
    if (!input || typeof input.uri !== "string") {
      throw new Error("tus: expected a { uri, size } input for the React Native file reader");
    }
    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw new Error(`tus: refusing to upload ${input.uri} with size ${String(input.size)}`);
    }
    return new ExpoFileSource(input);
  }
}

/**
 * tus `PreviousUpload` record. Re-declared structurally because
 * tus-js-client does not export the interface.
 */
export interface TusPreviousUpload {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
}

/** Namespace for tus's own URL bookkeeping. Distinct from our job records. */
export const TUS_URL_STORAGE_PREFIX = "elo-tus-url::";

/**
 * AsyncStorage-backed `urlStorage`.
 *
 * tus's default is `WebStorageUrlStorage`, which needs `localStorage`; on RN
 * `canStoreURLs` comes out false and tus silently installs a NoopUrlStorage,
 * so `storeFingerprintForResuming` becomes a no-op and tus can never resume
 * anything by itself. This gives that machinery a real backend.
 *
 * It is tus's OWN bookkeeping, not our resume path: the authoritative record
 * of a pending upload (file URI, match, athlete, attempt count, upload URL)
 * is `lib/video/upload-persistence.ts`, and the resume path passes
 * `uploadUrl` to tus explicitly. Keeping this installed means tus's
 * fingerprint entries are created and cleaned up (`removeFingerprintOnSuccess`)
 * instead of leaking through a silent no-op.
 */
export class AsyncStorageUrlStorage {
  async findAllUploads(): Promise<TusPreviousUpload[]> {
    return this.readMatching(TUS_URL_STORAGE_PREFIX);
  }

  async findUploadsByFingerprint(fingerprint: string): Promise<TusPreviousUpload[]> {
    return this.readMatching(`${TUS_URL_STORAGE_PREFIX}${fingerprint}::`);
  }

  async removeUpload(urlStorageKey: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(urlStorageKey);
    } catch {
      // Losing a bookkeeping entry costs a stale record, never an upload.
    }
  }

  async addUpload(fingerprint: string, upload: TusPreviousUpload): Promise<string> {
    const key = `${TUS_URL_STORAGE_PREFIX}${fingerprint}::${Date.now()}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(upload));
    } catch {
      // Same: the upload proceeds, it just cannot be found by fingerprint.
    }
    return key;
  }

  private async readMatching(prefix: string): Promise<TusPreviousUpload[]> {
    let keys: readonly string[];
    try {
      keys = await AsyncStorage.getAllKeys();
    } catch {
      return [];
    }
    const matching = keys.filter((k) => k.startsWith(prefix));
    if (matching.length === 0) return [];
    const results: TusPreviousUpload[] = [];
    for (const key of matching) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as TusPreviousUpload;
        results.push({ ...parsed, urlStorageKey: key });
      } catch {
        // A malformed entry must never block an upload (tus's own
        // WebStorageUrlStorage swallows the same parse error for the same
        // reason).
      }
    }
    return results;
  }
}
