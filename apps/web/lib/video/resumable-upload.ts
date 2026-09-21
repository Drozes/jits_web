import { Upload } from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resumable (tus) upload of a recorded match to Supabase Storage.
 *
 * WHY, ON WEB. The blob is assembled in the JS heap from `MediaRecorder`
 * chunks, so a page reload loses the recording whatever we do. What tus
 * buys here is the case that actually happens: a 300-600 MB `PUT` over gym
 * wifi that drops at 80%. The old `supabase.storage.upload(path, blob)` is
 * one request, so that drop threw away every byte and the only recovery was
 * to send all of it again over the same bad link. With tus the server keeps
 * the offset and the retry sends the remainder.
 *
 * It also gives real progress, which a single `upload()` call cannot: the
 * web timekeeper showed an indeterminate spinner for the whole transfer.
 */

/**
 * Supabase Storage's resumable endpoint requires EXACTLY 6 MiB chunks for
 * every PATCH but the last. Not a tuning knob; a different size is rejected.
 */
export const SUPABASE_TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export interface ResumableUploadParams {
  supabase: SupabaseClient;
  bucket: string;
  /** Canonical object key. MUST be stable across attempts. */
  path: string;
  blob: Blob;
  contentType: string;
  /** A URL from an earlier attempt, to resume rather than restart. */
  uploadUrl?: string | null;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  onUploadUrl?: (uploadUrl: string) => void;
}

/**
 * Upload `blob`, resuming from `uploadUrl` when one is given.
 *
 * tus's own retry loop is disabled (`retryDelays: null`) so there is a
 * single retry authority: the caller, which owns the backoff, the error
 * classification and the user-visible state. Two independent retry loops
 * would multiply their attempt counts together.
 *
 * The access token is resolved per call, so an attempt made long after the
 * recording does not present a stale JWT.
 */
export async function uploadBlobResumable({
  supabase,
  bucket,
  path,
  blob,
  contentType,
  uploadUrl,
  onProgress,
  onUploadUrl,
}: ResumableUploadParams): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Not signed in");

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(blob, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      uploadUrl: uploadUrl ?? undefined,
      chunkSize: SUPABASE_TUS_CHUNK_SIZE,
      uploadSize: blob.size,
      retryDelays: null,
      onShouldRetry: () => false,
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Preserved from the single-shot path: a retry re-PUTs the same key
        // and the backend keeps a storage UPDATE policy for exactly that.
        "x-upsert": "true",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      // The creation POST carries no bytes, so the upload URL exists before
      // the first chunk goes out and a retry can always resume.
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      // A `Blob` has no name or lastModified, so tus's default signature is
      // not stable for it. The object key is, and it is what identifies
      // this upload anyway.
      fingerprint: async () => `elo-match-video::${path}`,
      onUploadUrlAvailable: () => {
        if (upload.url) onUploadUrl?.(upload.url);
      },
      onProgress: (sent, total) => onProgress?.(sent, total),
      onSuccess: () => resolve(),
      onError: (err) => reject(err),
    });

    upload.start();
  });
}
