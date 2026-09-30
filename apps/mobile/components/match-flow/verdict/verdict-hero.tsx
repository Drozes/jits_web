import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { StillScrims } from "./scrim";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { InitialsBlock, KindTag, Mono, shortName } from "../fight/fight-ui";

export const HERO_HEIGHT = 360;

interface VerdictHeroProps {
  posterUrl: string | null;
  posterKey: string | null;
  /** Winner first when there is one (the fallback plate's left avatar). */
  left: string;
  right: string;
  upload: UploadBannerState;
  /** Some film exists or is on its way (a video row, or this phone's upload). */
  filmExpected: boolean;
  topInset: number;
}

function pct(p: number | null): string | null {
  return p != null && Number.isFinite(p) ? `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%` : null;
}

/**
 * The verdict's hero: the match's opening still (the slicer poster), or
 * while there is none yet both athletes on a plate with where the still is.
 */
export function VerdictHero({ posterUrl, posterKey, left, right, upload, filmExpected, topInset }: VerdictHeroProps) {
  const p = usePalette();
  if (posterUrl) {
    return (
      <View
        testID="verdict-still"
        accessibilityRole="image"
        accessibilityLabel={`Opening still of the match: ${shortName(left)} and ${shortName(right)}`}
        style={{ height: HERO_HEIGHT, backgroundColor: p.plate, overflow: "hidden" }}
      >
        <Image
          // Same cache namespace as components/film-room/opening-still.tsx.
          source={{ uri: posterUrl, cacheKey: posterKey ? `film-still-${posterKey}` : undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <StillScrims height={HERO_HEIGHT} ground={p.bg} />
        <View style={{ position: "absolute", left: 16, right: 16, top: topInset + 12, flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ height: 28, paddingHorizontal: 10, justifyContent: "center", borderWidth: 1, borderColor: ON_MEDIA.strong, borderRadius: FIGHT_RADIUS.tag, backgroundColor: ON_MEDIA.tag }}>
            <Mono color={ON_MEDIA.tagText}>OPENING STILL</Mono>
          </View>
          <KindTag onScrim />
        </View>
      </View>
    );
  }

  const uploading = upload.kind === "uploading" ? pct(upload.progress) : null;
  const label =
    upload.kind === "stopping"
      ? "FINISHING RECORDING"
      : upload.kind === "uploading"
        ? `UPLOADING${uploading ? ` ${uploading}` : ""} · STILL ARRIVES AFTER UPLOAD`
        : filmExpected
          ? "STILL ARRIVES AFTER UPLOAD"
          : "NO FILM FOR THIS MATCH";
  return (
    <View testID="verdict-still-fallback" style={{ height: HERO_HEIGHT, backgroundColor: p.plate, borderBottomWidth: 1, borderColor: p.hairline }}>
      <View style={{ position: "absolute", left: 16, right: 16, top: topInset + 12, alignItems: "flex-end" }}>
        <KindTag />
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingTop: topInset }}>
        {[left, right].map((name, i) => (
          <View key={`${name}-${i}`} style={{ alignItems: "center", gap: 10 }}>
            <InitialsBlock name={name} size={104} fontSize={34} />
            <Text numberOfLines={1} className="font-heading uppercase" style={{ fontSize: 13, letterSpacing: 0.8, color: p.text }}>
              {shortName(name)}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 22, gap: 8 }}>
        {uploading ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Video upload"
            accessibilityValue={{ min: 0, max: 100, now: Math.round((upload.progress ?? 0) * 100) }}
            style={{ height: 3, backgroundColor: p.hairline }}
          >
            <View style={{ height: 3, width: uploading as `${number}%`, backgroundColor: p.amber }} />
          </View>
        ) : null}
        <Text className="font-mono-medium" style={[{ fontSize: 10, letterSpacing: 2.2, color: p.text2 }, TABULAR]}>
          {label}
        </Text>
      </View>
    </View>
  );
}
