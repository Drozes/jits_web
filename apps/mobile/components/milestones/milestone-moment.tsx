import * as React from "react";
import { View } from "react-native";
import type { MilestoneCelebration } from "@/lib/milestones/milestone-store";
import { MilestoneBanner } from "./milestone-banner";
import { MilestoneBurst } from "./milestone-burst";

/**
 * A celebrated card or carousel (spec 10.6): the banner above it and the
 * burst falling over it. The tree is the same with or without a
 * celebration, so the child (a carousel mid-scroll, a card) never remounts
 * when one starts or ends.
 */
export function MilestoneMoment({
  celebration,
  onDismiss,
  children,
  flex = false,
}: {
  celebration: MilestoneCelebration | null;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Fill a flex row (a feed card cell). */
  flex?: boolean;
}) {
  const [height, setHeight] = React.useState(200);
  return (
    <View style={[flex ? { flex: 1 } : null, celebration ? { gap: 10 } : null]}>
      {celebration ? (
        <MilestoneBanner key={celebration.milestone} milestone={celebration.milestone} copy={celebration.copy} onDismiss={onDismiss} />
      ) : null}
      <View onLayout={(e) => setHeight(Math.max(80, e.nativeEvent.layout.height))}>
        {children}
        {celebration ? <MilestoneBurst play={celebration.particles} palette={celebration.confetti} height={height} /> : null}
      </View>
    </View>
  );
}
