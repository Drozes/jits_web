import * as React from "react";
import { View } from "react-native";

/**
 * A 1x1, non-interactive accessibility element the match-loop harness reads
 * through idb (the step-marker pattern). A testID + label on a plain
 * container View is not an accessibility element on iOS, so it never shows
 * up; this one is `accessible`, has a real frame, and is not hidden or
 * transparent. Render exactly one per testID.
 */
export function HarnessMarker({ testID, label }: { testID: string; label: string }) {
  return (
    <View
      accessible
      testID={testID}
      accessibilityLabel={label}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1 }}
    />
  );
}
