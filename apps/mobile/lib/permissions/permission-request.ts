/**
 * System permission prompts in flight (location, camera, microphone). On
 * Android the runtime permission dialog pauses the activity, so AppState
 * reports "background" (then "active") while it is up; iOS reports
 * "inactive". Owners that treat a background as "the athlete left" (live
 * status, `app:online` presence, the Go Live flow, the challenger's one-time
 * ask) ignore a background while this is set (jits-3dc2).
 *
 * Every caller that shows a system permission prompt wraps the request in
 * `trackPermissionRequest`. A request that only READS the current status
 * (`get*PermissionsAsync`) shows nothing and is not wrapped.
 */
let permissionRequests = 0;

export function permissionRequestInFlight(): boolean {
  return permissionRequests > 0;
}

/** Runs `request` (one system permission prompt) with the in-flight counter held. */
export async function trackPermissionRequest<T>(request: () => Promise<T>): Promise<T> {
  permissionRequests += 1;
  try {
    return await request();
  } finally {
    permissionRequests -= 1;
  }
}
