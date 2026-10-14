import { redirect } from "next/navigation";
import { isWebAppEnabled } from "./web-app-lock";

/**
 * Defense in depth for the web app lock (specs/web-landing/spec.md): the
 * proxy matcher skips paths ending in an image or .html extension (for
 * example /messages/x.png), so the (app) and /design layouts also send a
 * locked request home. The flag is a build-time env read, so this is safe in
 * a synchronous layout under cacheComponents.
 */
export function redirectHomeWhenLocked(): void {
  if (!isWebAppEnabled()) redirect("/");
}
