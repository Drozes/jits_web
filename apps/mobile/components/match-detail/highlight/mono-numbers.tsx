import * as React from "react";
import { Text } from "react-native";
import { TABULAR } from "@/lib/typography";

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
          <Text key={i} testID="mono-number" className="font-mono" style={TABULAR}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}
