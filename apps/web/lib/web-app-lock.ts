/** Internal route that renders the landing page; only ever served at "/". */
export const LANDING_INTERNAL_PATH = "/welcome";

/**
 * The live web app is enabled only when NEXT_PUBLIC_WEB_APP_ENABLED is the
 * exact string "true". Unset or anything else means locked (spec
 * specs/web-landing/spec.md). Read as a literal member expression so Next
 * inlines it in client bundles; changing it needs a redeploy.
 */
export function isWebAppEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true";
}
