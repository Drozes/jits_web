import * as React from "react";
import { formatElapsed } from "./format-elapsed";

/**
 * The result step's finish-time field: prefilled from the match clock at
 * End Match (when known), still editable. `fromClock` stays true until the
 * user edits the value, so the field can say where the prefill came from.
 */
export function useFinishTimeField(initialFinishSeconds?: number) {
  const [finishTimeStr, setFinishTimeStr] = React.useState(() =>
    initialFinishSeconds != null ? formatElapsed(initialFinishSeconds) : "",
  );
  const [fromClock, setFromClock] = React.useState(initialFinishSeconds != null);
  const onChange = React.useCallback((v: string) => {
    setFromClock(false);
    setFinishTimeStr(v);
  }, []);
  return { finishTimeStr, fromClock, onChange };
}
