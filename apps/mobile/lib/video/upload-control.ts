/**
 * The upload actions UI and auth code call, WITHOUT importing the upload
 * manager.
 *
 * `video-upload-manager.ts` pulls in tus, the Supabase client and the file
 * system. Importing it from the auth context, the settings screen or a Film
 * Room card would drag that whole graph into every one of them (and every
 * test that renders them). So the manager registers its implementation
 * here when it loads, which it does at app start through
 * `<VideoUploadBootstrap />`, and callers go through these functions.
 * Before registration they are safe no-ops: nothing can be uploading if
 * the manager has never loaded.
 */
export interface UploadControl {
  retry: (matchId: string) => Promise<boolean>;
  discard: (matchId: string) => Promise<boolean>;
  hasPending: () => Promise<boolean>;
  stopForSignOut: () => void;
}

let impl: UploadControl | null = null;

export function registerUploadControl(control: UploadControl): void {
  impl = control;
}

/** Run a paused or failed upload now (see `retryMatchVideoUpload`). */
export function retryMatchUpload(matchId: string): Promise<boolean> {
  return impl ? impl.retry(matchId) : Promise.resolve(false);
}

/** Drop a recording that can never upload (see `discardMatchVideoUpload`). */
export function discardMatchUpload(matchId: string): Promise<boolean> {
  return impl ? impl.discard(matchId) : Promise.resolve(false);
}

/** The signed-in athlete still owes the server a video. */
export function hasPendingMatchUploads(): Promise<boolean> {
  return impl ? impl.hasPending() : Promise.resolve(false);
}

/** Stop every runner and forget the leaving athlete's uploads. */
export function stopMatchUploadsForSignOut(): void {
  impl?.stopForSignOut();
}

/** Test-only. */
export function __setUploadControl(control: UploadControl | null): void {
  impl = control;
}
