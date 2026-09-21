/**
 * Tests for the web resumable (tus) upload (lib/video/resumable-upload.ts).
 *
 * The protocol itself is tus-js-client's problem. What matters here is that
 * we hand it what Supabase Storage requires and what a retry needs: the
 * resumable endpoint, the mandated 6 MiB chunk size, the object key as
 * metadata, the `x-upsert` header the backend's storage UPDATE policy
 * expects, and an upload URL reported early enough for a retry to resume.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

interface CapturedUpload {
  blob: Blob;
  options: Record<string, unknown>;
}

const captured: CapturedUpload[] = [];
const onStart: { current: ((upload: { options: Record<string, unknown>; setUrl: (u: string) => void }) => void) | null } = {
  current: null,
};

vi.mock("tus-js-client", () => ({
  Upload: class {
    url: string | null = null;
    options: Record<string, unknown>;
    blob: Blob;
    constructor(blob: Blob, options: Record<string, unknown>) {
      this.blob = blob;
      this.options = options;
      captured.push({ blob, options });
    }
    start() {
      onStart.current?.({
        options: this.options,
        setUrl: (u: string) => {
          this.url = u;
        },
      });
    }
  },
}));

import { SUPABASE_TUS_CHUNK_SIZE, uploadBlobResumable } from "./resumable-upload";

const mockGetSession = vi.fn();

const supabase = {
  auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
} as unknown as SupabaseClient;

const BASE = {
  supabase,
  bucket: "match-videos",
  path: "M/A/123.webm",
  blob: new Blob(["0123456789"], { type: "video/webm" }),
  contentType: "video/webm",
};

function invoke(options: Record<string, unknown>, key: string, ...args: unknown[]): void {
  const fn = options[key];
  if (typeof fn === "function") (fn as (...rest: unknown[]) => void)(...args);
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  onStart.current = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});

describe("uploadBlobResumable", () => {
  it("targets the resumable endpoint with Supabase's mandated chunk size", async () => {
    onStart.current = (u) => invoke(u.options, "onSuccess");
    await uploadBlobResumable(BASE);

    const { options } = captured[0];
    expect(options.endpoint).toBe("https://example.supabase.co/storage/v1/upload/resumable");
    expect(options.chunkSize).toBe(SUPABASE_TUS_CHUNK_SIZE);
    expect(SUPABASE_TUS_CHUNK_SIZE).toBe(6 * 1024 * 1024);
    expect(options.uploadSize).toBe(BASE.blob.size);
  });

  it("keeps the x-upsert retry semantics the backend expects", async () => {
    onStart.current = (u) => invoke(u.options, "onSuccess");
    await uploadBlobResumable(BASE);
    expect(captured[0].options.headers).toMatchObject({
      authorization: "Bearer tok",
      "x-upsert": "true",
    });
  });

  it("sends the caller's object key verbatim as tus metadata", async () => {
    onStart.current = (u) => invoke(u.options, "onSuccess");
    await uploadBlobResumable(BASE);
    expect(captured[0].options.metadata).toMatchObject({
      bucketName: "match-videos",
      objectName: "M/A/123.webm",
      contentType: "video/webm",
    });
  });

  it("resumes from a previously reported upload URL", async () => {
    onStart.current = (u) => invoke(u.options, "onSuccess");
    await uploadBlobResumable({ ...BASE, uploadUrl: "https://up/abc" });
    expect(captured[0].options.uploadUrl).toBe("https://up/abc");
  });

  it("leaves tus's own retry loop disabled so there is one retry authority", async () => {
    onStart.current = (u) => invoke(u.options, "onSuccess");
    await uploadBlobResumable(BASE);
    expect(captured[0].options.retryDelays).toBeNull();
    expect((captured[0].options.onShouldRetry as () => boolean)()).toBe(false);
  });

  it("reports the upload URL before any bytes go out", async () => {
    const seen: string[] = [];
    onStart.current = (u) => {
      u.setUrl("https://up/created");
      invoke(u.options, "onUploadUrlAvailable");
      invoke(u.options, "onSuccess");
    };
    await uploadBlobResumable({ ...BASE, onUploadUrl: (url) => seen.push(url) });
    expect(seen).toEqual(["https://up/created"]);
    // A kill during the first chunk must still leave something resumable.
    expect(captured[0].options.uploadDataDuringCreation).toBe(false);
  });

  it("fingerprints from the object key, because a Blob has no stable identity", async () => {
    onStart.current = (u) => invoke(u.options, "onSuccess");
    await uploadBlobResumable(BASE);
    const fingerprint = captured[0].options.fingerprint as () => Promise<string>;
    await expect(fingerprint()).resolves.toBe("elo-match-video::M/A/123.webm");
  });

  it("forwards byte progress", async () => {
    const seen: Array<[number, number]> = [];
    onStart.current = (u) => {
      invoke(u.options, "onProgress", 5, 10);
      invoke(u.options, "onSuccess");
    };
    await uploadBlobResumable({ ...BASE, onProgress: (a, b) => seen.push([a, b]) });
    expect(seen).toEqual([[5, 10]]);
  });

  it("rejects with the tus error so the caller can classify it", async () => {
    onStart.current = (u) => invoke(u.options, "onError", new Error("Network request failed"));
    await expect(uploadBlobResumable(BASE)).rejects.toThrow("Network request failed");
  });

  it("refuses to upload without a session rather than sending an anonymous PUT", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(uploadBlobResumable(BASE)).rejects.toThrow(/Not signed in/);
    expect(captured).toHaveLength(0);
  });
});
