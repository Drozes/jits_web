import * as React from "react";
import { useRouter } from "expo-router";

/** Close: back to the opening surface; a cold-start push has no back stack, so Home. */
export function useViewerClose(): () => void {
  const router = useRouter();
  return React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
}
