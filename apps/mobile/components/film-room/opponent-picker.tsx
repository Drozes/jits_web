import * as React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "@/lib/theme/palette";

interface OpponentPickerProps {
  visible: boolean;
  opponents: { id: string; name: string; count: number }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

function Row({ label, detail, on, onPress, testID }: { label: string; detail?: string; on: boolean; onPress: () => void; testID: string }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      className="flex-row items-center justify-between active:opacity-70"
      style={{ minHeight: 52, borderBottomWidth: 1, borderBottomColor: p.hairline }}
    >
      <Text className="font-heading uppercase" style={{ fontSize: 14, letterSpacing: 0.4, color: on ? p.text : p.text2 }}>
        {label}
      </Text>
      {detail ? (
        <Text className="font-mono-medium" style={{ fontSize: 10, letterSpacing: 1.68, color: p.text3 }}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Bottom sheet listing the opponents in the loaded matches. A plain RN Modal
 * (no new native module); radius 8 is the sheet exception to the brand's 4.
 */
export function OpponentPicker({ visible, opponents, selectedId, onSelect, onClose }: OpponentPickerProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close opponent filter" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />
        <View
          testID="film-opponent-sheet"
          style={{ backgroundColor: p.plate, borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 16, maxHeight: "70%" }}
        >
          <Text className="font-mono-bold" style={{ fontSize: 10, letterSpacing: 2.52, color: p.text, marginBottom: 8 }}>
            OPPONENT
          </Text>
          <ScrollView>
            <Row testID="film-opponent-any" label="Everyone" on={!selectedId} onPress={() => onSelect(null)} />
            {opponents.map((o) => (
              <Row
                key={o.id}
                testID={`film-opponent-${o.id}`}
                label={o.name}
                detail={`${o.count} ${o.count === 1 ? "MATCH" : "MATCHES"}`}
                on={selectedId === o.id}
                onPress={() => onSelect(o.id)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
