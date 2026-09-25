/**
 * expo-router's native URL hook: every incoming system URL (launch and while
 * running) passes through here before it is routed. The mapping lives in
 * lib/deep-links/system-path.ts so it can be unit tested without the router.
 */
import { resolveSystemPath } from "@/lib/deep-links/system-path";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  // expo-router warns that a throw here can crash the app; an unrecognised
  // URL is always better routed as-is.
  try {
    return resolveSystemPath(path);
  } catch {
    return path;
  }
}
