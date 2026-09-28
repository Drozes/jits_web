import * as React from "react";
import { Text, View } from "react-native";

/** The collaborator tip from `buildCollabTip` (one post on both profiles). */
export function CollabTip({ tip }: { tip: string }) {
  if (!tip) return null;
  return (
    <View testID="share-collab-tip" className="border-l-2 border-hairline-strong pl-3">
      <Text className="font-body text-[12px] text-ink-2">{tip}</Text>
    </View>
  );
}
