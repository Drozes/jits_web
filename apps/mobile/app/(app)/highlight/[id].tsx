import * as React from "react";
import { useLocalSearchParams } from "expo-router";
import { ViewerScreen } from "@/components/highlight-viewer/viewer-screen";
import { parseHighlightSource } from "@/lib/highlight/discovery";

/**
 * Full-screen viewer for one of the athlete's own highlight reels
 * (`/highlight/<id>?source=push|bell|home|profile|match_detail|summary`).
 * An unknown or missing source counts as `match_detail`.
 */
export default function HighlightViewerRoute() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  return <ViewerScreen id={id} source={parseHighlightSource(source)} />;
}
