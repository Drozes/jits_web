import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { StillScrims } from "./scrim";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { filmStillCaption } from "@/lib/video/upload-copy";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { InitialsBlock, Mono, shortName } from "../fight/fight-ui";
import { TRACKING, typeStep } from "@/lib/typography";

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
  /** The server already has a video row (either athlete), or this phone's landed. */
  hasServerVideo?: boolean;
  /** The Film status's own caption when it says there is no film (yet); wins over the upload table. */
  statusCaption?: string | null;
  topInset: number;
}

function pct(p: number | null): string | null {
  return p != null && Number.isFinite(p) ? `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%` : null;
}

/**
 * The verdict's hero: the match's opening still (the slicer poster), or
 * while there is none yet both athletes on a plate with where the still is.
 */
/** The banner state as the upload entry the shared caption reads. */
function localOf(upload: UploadBannerState): Pick<MatchUploadEntry, "status" | "progress"> | null {
  switch (upload.kind) {
    case "uploading":
      return { status: "uploading", progress: upload.progress };
    case "paused":
      return { status: "paused", progress: upload.progress };
    case "uploaded":
      return { status: "uploaded", progress: 1 };
    case "error":
      // Only an UPLOAD failure; a recorder failure has no class and no film.
      return upload.errorClass != null ? { status: "error", progress: null } : null;
    default:
      return null;
  }
}

export function VerdictHero({ posterUrl, posterKey, left, right, upload, filmExpected, hasServerVideo, statusCaption, topInset }: VerdictHeroProps) {
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
        </View>
      </View>
    );
  }

  const uploading = upload.kind === "uploading" || upload.kind === "paused" ? pct(upload.progress) : null;
  // One caption table for every film surface (lib/video/upload-copy.ts):
  // "PROCESSING FILM" once the bytes are in, never "after upload"
  // (jits-n2im.4 item 6).
  const label =
    upload.kind === "stopping"
      ? "FINISHING RECORDING"
      : statusCaption
        ? statusCaption
        : filmStillCaption(localOf(upload), hasServerVideo ?? filmExpected, "NO FILM FOR THIS MATCH");
  return (
    <View testID="verdict-still-fallback" style={{ height: HERO_HEIGHT, backgroundColor: p.plate, borderBottomWidth: 1, borderColor: p.hairline }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, paddingTop: topInset }}>
        {[left, right].map((name, i) => (
          <View key={`${name}-${i}`} style={{ alignItems: "center", gap: 10 }}>
            <InitialsBlock name={name} size={104} fontSize="display-36" />
            <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text }]}>
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
        <Text className="font-mono-medium" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-xl"], color: p.text2 }, TABULAR]}>
          {label}
        </Text>
      </View>
    </View>
  );
}
