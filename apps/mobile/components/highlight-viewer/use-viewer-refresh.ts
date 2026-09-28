import * as React from "react";
import { useFocusEffect } from "expo-router";

/**
 * Re-read the reel's progress when the viewer regains focus (back from a
 * pushed screen). Not on the first focus: mount already read it. A return
 * from the background is handled by `useMyHighlight` itself.
 */
export function useViewerRefresh(reload: () => void): void {
  const first = React.useRef(true);
  const reloadRef = React.useRef(reload);
  reloadRef.current = reload;
  useFocusEffect(
    React.useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reloadRef.current();
    }, []),
  );
}
