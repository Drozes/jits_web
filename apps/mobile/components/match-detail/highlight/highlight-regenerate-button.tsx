import * as React from "react";
import { Button } from "@/components/ui/elo-system/button";
import { HIGHLIGHT_COPY, regenerateLabel } from "@/lib/highlight/highlight-copy";
import { MonoNumbers } from "./mono-numbers";

interface Props {
  rendersRemaining: number;
  disabled: boolean;
  working: boolean;
  onPress: () => void;
}

/** The sheet's ONE Signal Red CTA, with a spinner while the AI works (~30 s). */
export function HighlightRegenerateButton({ rendersRemaining, disabled, working, onPress }: Props) {
  const label = regenerateLabel(rendersRemaining);
  return (
    <Button
      testID="highlight-regenerate"
      label={working ? HIGHLIGHT_COPY.working : label}
      labelContent={working ? undefined : <MonoNumbers text={label} />}
      accessibilityLabel={label}
      height={44}
      disabled={disabled}
      busy={working}
      onPress={onPress}
    />
  );
}
