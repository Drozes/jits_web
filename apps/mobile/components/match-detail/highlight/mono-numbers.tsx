import * as React from "react";
import { Text } from "react-native";

/** Tabular mono for digits inside a label, whatever the label's own font. */
const MONO_STYLE = { fontVariant: ["tabular-nums" as const] };

/**
 * Children for a `Text`: `text` with every run of digits wrapped in a nested
 * mono tabular-nums span ("Regenerate (3 left)", "Making version 2…"), so
 * numbers in labels follow the brand rule without splitting the copy.
 */
export function MonoNumbers({ text }: { text: string }) {
  const parts = text.split(/(\d+)/);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? (
          <Text key={i} testID="mono-number" className="font-mono" style={MONO_STYLE}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}
