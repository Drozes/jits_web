import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { Camera, CameraView } from "expo-camera";
import { CAPTURE_CODEC_QUERY_TIMEOUT_MS } from "./capture-bitrate";

/**
 * The iOS codecs a recording can ask for (dynamic capture bitrate, spec 7.3).
 *
 * iOS applies a bitrate only together with a codec, and a codec the output
 * cannot record REJECTS `recordAsync`, so the picker uses a codec only when
 * this list names it. The list is cached in memory and on disk per OS
 * version: a relaunch re-entry (D6) has to decide on its first render, with
 * no native call.
 *
 * Android has no such query (expo-camera throws `UnavailabilityError`), so
 * nothing here runs there.
 *
 * An empty answer is never cached: the native helper opens the FRONT camera
 * on a throwaway session and returns `[]` when it cannot, which says nothing
 * about the back camera that records.
 *
 * Asked only with camera permission ALREADY granted (phase 2 review): the
 * helper creates a capture device input, which can raise the iOS camera
 * prompt while the permission is undetermined, and the capture prep now
 * reads this before the camera screen (the timekeeper's request sheet).
 * Without a grant the answer is null and nothing is cached, so the first
 * read after the grant still asks.
 */

export const CAPTURE_CODECS_KEY = "elo-capture-codecs::v1";

let cached: string[] | null = null;
let inFlight: Promise<string[] | null> | null = null;

function osVersion(): string {
  return String(Platform.Version);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((c) => typeof c === "string");
}

/** Load the stored list (no native call). Called once at app start; never throws. */
export async function primeCaptureCodecCache(): Promise<void> {
  if (Platform.OS !== "ios" || cached) return;
  try {
    const raw = await AsyncStorage.getItem(CAPTURE_CODECS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { os?: unknown; codecs?: unknown } | null;
    if (parsed?.os === osVersion() && isStringList(parsed.codecs) && parsed.codecs.length > 0 && !cached) {
      cached = parsed.codecs;
    }
  } catch {
    /* no cache: the face-off asks the camera */
  }
}

/** The list in memory, synchronously; null when not known. */
export function cachedCaptureCodecs(): string[] | null {
  return cached;
}

/** Cache a usable answer in memory and on disk; null for an unusable one. */
async function store(answer: unknown): Promise<string[] | null> {
  if (!isStringList(answer) || answer.length === 0) return null;
  cached = answer;
  try {
    await AsyncStorage.setItem(CAPTURE_CODECS_KEY, JSON.stringify({ os: osVersion(), codecs: answer }));
  } catch {
    /* in memory for this process anyway */
  }
  return answer;
}

/** Camera permission already granted; reads the state only (never prompts). */
async function cameraGranted(): Promise<boolean> {
  try {
    const read = Camera?.getCameraPermissionsAsync;
    if (typeof read !== "function") return false;
    const p = await read.call(Camera);
    return Boolean(p?.granted);
  } catch {
    return false;
  }
}

async function queryCodecs(): Promise<string[] | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const query = CameraView.getAvailableVideoCodecsAsync;
    if (typeof query !== "function") return null;
    // The answer is cached whenever it arrives: one that misses this
    // face-off's timeout still serves the next face-off and a re-entry.
    // The permission read is inside the same bound.
    const answered = cameraGranted().then((granted) =>
      granted ? Promise.resolve(query.call(CameraView)).then(store, () => null) : null,
    );
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CAPTURE_CODEC_QUERY_TIMEOUT_MS);
    });
    return await Promise.race([answered, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The list, from the cache or one native query (2 s timeout, concurrent
 * callers share it). Null on Android, on a failure, a timeout or an empty
 * answer; the next face-off asks again. Never throws.
 */
export function ensureCaptureCodecs(): Promise<string[] | null> {
  if (Platform.OS !== "ios") return Promise.resolve(null);
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = queryCodecs().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Test-only reset. */
export function __resetCaptureCodecsForTests(): void {
  cached = null;
  inFlight = null;
}
