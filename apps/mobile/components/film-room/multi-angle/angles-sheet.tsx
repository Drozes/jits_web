import * as React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { angleTag } from "@jits/shared/utils";
import { angleText } from "@/components/film-room/angle-switcher";
import { shortName } from "@/lib/film-room/format";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { useModalAnimation } from "@/lib/motion";
import { angleOwnerName, angleRowA11yLabel, angleStatus } from "@/lib/video/angle-status";
import { MULTI_ANGLE_COPY } from "@/lib/video/multi-angle/copy";
import { BEST_ANGLE } from "@/lib/video/video-status-copy";
import type { AngleVideo } from "@/lib/video/multi-angle/trust";
import { OnMediaTag } from "./angle-bar";

interface AnglesSheetProps {
  open: boolean;
  onClose: () => void;
  /** Every angle of the match, in the deck's row order. */
  videos: AngleVideo[];
  activeId: string;
  /** Angles the quick switch offers (ready and loaded). */
  switchableIds: string[];
  /** Ready angles shown as approximate (clock-only sync). */
  approximateIds: string[];
  opponentName?: string | null;
  onSelect: (id: string) => void;
}

/**
 * Every expected angle, ready or not (research 03, 4.4; owner decision
 * 2026-10-05): the quick switch stays ready-only (deck rule 4), and this
 * sheet says where the others are with the deck's own row strings
 * (`angleStatus`: Uploading 42%, Processing, Not used, Didn't upload), never
 * red for someone else. Only a switchable row is a button.
 */
export function AnglesSheet({ open, onClose, videos, activeId, switchableIds, approximateIds, opponentName, onSelect }: AnglesSheetProps) {
  const insets = useSafeAreaInsets();
  const animation = useModalAnimation("slide");
  const hasBest = switchableIds.length >= 2;
  return (
    <Modal visible={open} transparent animationType={animation} onRequestClose={onClose}>
      <Pressable testID="angles-sheet-backdrop" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: ON_MEDIA.scrim }} />
      <View
        testID="angles-sheet"
        accessibilityViewIsModal
        style={{ backgroundColor: ON_MEDIA.ground, borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingTop: 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 16, gap: 12 }}
      >
        <Text accessibilityRole="header" className="font-heading uppercase" style={[typeStep("callout"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.white }]}>
          {MULTI_ANGLE_COPY.sheetTitle}
        </Text>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
          {videos.map((v) => {
            const label = angleText(v, opponentName);
            const role = angleTag(v.recording_type);
            const status = angleStatus(v, { name: angleOwnerName(v, opponentName, shortName) });
            const canSwitch = switchableIds.includes(v.id);
            const active = v.id === activeId;
            const approx = canSwitch && approximateIds.includes(v.id);
            const best = hasBest && v.is_primary === true && canSwitch;
            const tags = [role, best ? BEST_ANGLE : null, approx ? MULTI_ANGLE_COPY.approxSync : null].filter((t): t is string => t != null);
            const stateText = active ? MULTI_ANGLE_COPY.watching : status.tag;
            const a11y = angleRowA11yLabel(label, tags.join(", ") || null, { ...status, tag: stateText });
            return (
              <Pressable
                key={v.id}
                testID={`angles-row-${v.id}`}
                disabled={!canSwitch || active}
                accessibilityRole={canSwitch && !active ? "button" : undefined}
                accessibilityState={{ selected: active, disabled: !canSwitch }}
                accessibilityLabel={a11y}
                onPress={() => {
                  onSelect(v.id);
                  onClose();
                }}
                className="active:opacity-80"
                style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: active ? ON_MEDIA.strong : ON_MEDIA.track, backgroundColor: active ? ON_MEDIA.glassStrong : ON_MEDIA.glass, gap: 6 }}
              >
                <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                  <Text numberOfLines={1} className="flex-1 font-mono-bold" style={[typeStep("caption"), { letterSpacing: TRACKING.caps, color: canSwitch ? ON_MEDIA.white : ON_MEDIA.text3 }, TABULAR]}>
                    {label.toUpperCase()}
                  </Text>
                  <Text testID={`angles-row-${v.id}-state`} className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING.caps, color: ON_MEDIA.text2 }, TABULAR]}>
                    {[stateText, active ? null : status.right].filter(Boolean).join(" ").toUpperCase()}
                  </Text>
                </View>
                {tags.length > 0 ? (
                  <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                    {tags.map((t) => (
                      <OnMediaTag key={t} text={t} />
                    ))}
                  </View>
                ) : null}
                {status.helper && !canSwitch ? (
                  <Text className="font-body" style={[typeStep("small"), { color: ON_MEDIA.text2 }]}>
                    {status.helper}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <Text className="font-body" style={[typeStep("small"), { color: ON_MEDIA.text3 }]}>
          {MULTI_ANGLE_COPY.sheetHelper}
        </Text>
      </View>
    </Modal>
  );
}
