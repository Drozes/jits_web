import { Text, View } from "react-native";
import type { QualityPreference } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";
import { SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";
import { StatePressable } from "@/components/ui/state-pressable";
import { setPlaybackQualityPreference, usePlaybackQualityPreference } from "@/lib/video/quality/preference";

const QUALITY_OPTIONS: { value: QualityPreference; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Best quality your connection can hold. Switches to a lighter version if the video stalls.",
  },
  { value: "high", label: "High", description: "Always the 720p version. Uses more data." },
  {
    value: "data_saver",
    label: "Data saver",
    description: "Always the 360p version. Uses about a quarter of the data.",
  },
];

function QualityOptionRow({
  option,
  selected,
  onPress,
}: {
  option: (typeof QUALITY_OPTIONS)[number];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <StatePressable
      dim
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.label}
      accessibilityHint={option.description}
      testID={`playback-quality-${option.value}`}
      className={`min-h-[44px] flex-row items-center gap-3 rounded-xs border px-4 py-3 ${selectionSurface(selected)}`}
    >
      <View className="flex-1 gap-1">
        <Text
          className={`font-heading text-small uppercase tracking-caps-l ${selected ? "text-ink" : "text-ink-2"}`}
        >
          {option.label}
        </Text>
        <Text className="font-body text-small text-ink-2">{option.description}</Text>
      </View>
      {selected ? <SelectCheck /> : null}
    </StatePressable>
  );
}

/**
 * Video settings: the playback quality choice (jits-xfvd.12), saved per
 * phone the moment a row is tapped, then the recording lede (unchanged).
 * Selection is a surface step plus an ink check, never Signal Red.
 */
export default function SettingsVideoScreen() {
  const preference = usePlaybackQualityPreference();
  return (
    <>
      <AppHeader title="Video Settings" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 16 }}
      >
        <Plate className="gap-3">
          <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-l">
            PLAYBACK QUALITY
          </Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Playback quality" style={{ gap: 8 }}>
            {QUALITY_OPTIONS.map((option) => (
              <QualityOptionRow
                key={option.value}
                option={option}
                selected={preference === option.value}
                onPress={() => setPlaybackQualityPreference(option.value)}
              />
            ))}
          </View>
          <Text className="font-body text-small text-ink-2 leading-relaxed">
            Applies to match films on this phone. Highlight reels are not affected. If a version is
            still processing, the closest one that is ready plays.
          </Text>
        </Plate>
        <Plate>
          <Text className="font-body text-small text-ink-2 leading-relaxed">
            Video recording settings will be available here. Match recordings
            can be configured for automatic or manual capture.
          </Text>
        </Plate>
      </PageContainer>
    </>
  );
}
