/**
 * How a failed resumable-upload attempt should be treated by the retry
 * loop. Shared because both apps upload match video over tus and must
 * treat the same status the same way: mobile's
 * `lib/video/video-upload-manager.ts` and web's
 * `hooks/use-video-recorder.ts`.
 *
 * Deliberately free of any tus / expo / Supabase import, so the retry
 * policy can be reasoned about (and tested) on its own, and so a test can
 * double the transport while keeping the REAL classifier.
 *
 * `resetUploadUrl` exists because a Supabase resumable upload URL is not
 * permanent: the server drops an unfinished upload after roughly 24 h, and
 * a PATCH or HEAD against a dropped one answers 404/410. Retrying that same
 * URL forever would burn every remaining attempt on a corpse, so the URL is
 * discarded and the next attempt creates a new one against the SAME object
 * key, which the `x-upsert` storage UPDATE policy allows.
 */
export interface UploadFailureClass {
  retryable: boolean;
  resetUploadUrl: boolean;
  status: number | null;
}

/** Pull an HTTP status out of a tus `DetailedError`, if it carries one. */
export function statusOfUploadError(err: unknown): number | null {
  const res = (err as { originalResponse?: { getStatus?: () => number } } | null)?.originalResponse;
  if (!res || typeof res.getStatus !== "function") return null;
  const status = res.getStatus();
  return Number.isFinite(status) ? status : null;
}

export function classifyUploadError(err: unknown): UploadFailureClass {
  const status = statusOfUploadError(err);

  // No status at all: a transport-level failure (DNS, TLS, socket reset,
  // airplane mode). Exactly the case this whole feature exists for.
  if (status == null) return { retryable: true, status, resetUploadUrl: false };

  // The upload the URL points at is gone. Start a new one, same object key.
  if (status === 404 || status === 410) {
    return { retryable: true, status, resetUploadUrl: true };
  }

  // 401 is retryable on purpose: every attempt resolves a fresh access
  // token, so an expired JWT (very likely on a clip resumed the next
  // morning) fixes itself. 403 does not, because that is RLS saying no.
  // 409 is a tus offset conflict: the local idea of the upload disagrees
  // with the server's, so the URL is rebuilt rather than re-patched.
  if (status === 401 || status === 408 || status === 409 || status === 423 || status === 429) {
    return { retryable: true, status, resetUploadUrl: status === 409 };
  }

  // 413 (too large) and 403 (RLS) will not change however long we wait.
  if (status >= 400 && status < 500) return { retryable: false, status, resetUploadUrl: false };

  // 5xx: the server is having a bad time, which is the definition of
  // transient.
  return { retryable: true, status, resetUploadUrl: false };
}
