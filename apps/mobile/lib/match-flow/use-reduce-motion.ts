import * as React from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The OS "Reduce Motion" setting. The countdown and verdict celebration (the
 * two approved animation exceptions) show their end state without motion
 * when it is on. False until the first read lands.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (alive) setReduce(v === true);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => setReduce(v === true));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}
