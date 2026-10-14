import * as React from "react";
import { AccessibilityInfo, ScrollView, Text, View } from "react-native";
import type { OutlineEntry } from "@jits/shared/legal";
import { StatePressable } from "@/components/ui/state-pressable";

/**
 * The legal modal's Contents panel (jits-rog5.10): the document's H2
 * sections over the text, inside the modal. A modal view for screen readers
 * (the text behind it is hidden by the screen), with focus moved to its
 * header when it opens; Android back closes it (the screen's BackHandler).
 */
export function ContentsPanel({
  title,
  entries,
  bottomInset,
  onPick,
}: {
  title: string;
  entries: OutlineEntry[];
  bottomInset: number;
  onPick: (entry: OutlineEntry) => void;
}) {
  const headerRef = React.useRef<Text>(null);
  React.useEffect(() => {
    // After the panel's first frame, so the header is laid out when focus
    // lands. The ref-based form of setAccessibilityFocus(findNodeHandle(...)).
    const frame = requestAnimationFrame(() => {
      if (headerRef.current) AccessibilityInfo.sendAccessibilityEvent(headerRef.current, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <View testID="legal-contents-panel" accessibilityViewIsModal className="absolute inset-0 bg-surface">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: bottomInset + 32 }}>
        <Text
          ref={headerRef}
          testID="legal-contents-title"
          accessibilityRole="header"
          className="font-heading text-small text-ink-2 uppercase tracking-caps-l pb-2"
        >
          {title}
        </Text>
        {entries.map((entry) => (
          <StatePressable
            key={entry.index}
            dim
            testID={`legal-outline-${entry.index}`}
            accessibilityRole="link"
            onPress={() => onPick(entry)}
            className="min-h-[44px] justify-center border-b border-hairline-faint"
          >
            <Text className="font-body text-callout text-ink">{entry.text}</Text>
          </StatePressable>
        ))}
      </ScrollView>
    </View>
  );
}
