import * as React from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useThemedTokens } from "@/lib/theme/use-theme";

interface PasteInviteButtonProps {
  /**
   * Called with whatever text the athlete pasted (a link, a code, or noise).
   * The caller extracts the first `/c/<token>` or 6-char code with the shared
   * invite parser and records gateway `paste`.
   */
  onPasteText: (text: string) => void;
  /** Shown under the button; defaults to the first-open prompt. */
  hint?: string;
}

/**
 * The system paste control (iOS 16+ UIPasteControl via expo-clipboard). It
 * reads the clipboard only when the athlete taps it, so iOS shows no "Allow
 * Paste" prompt and no permission is needed. Apple fixes the label ("Paste")
 * and icon; we only set colors and corners from the theme tokens. Renders
 * nothing where the control is unavailable (Android, web, iOS < 16): callers
 * keep the typed-code path as the fallback.
 */
export function PasteInviteButton({
  onPasteText,
  hint = "Copied a challenge link? Paste it here.",
}: PasteInviteButtonProps) {
  const tokens = useThemedTokens();
  if (!Clipboard.isPasteButtonAvailable) return null;

  return (
    <View className="items-center gap-2" testID="paste-invite">
      <Clipboard.ClipboardPasteButton
        acceptedContentTypes={["plain-text"]}
        displayMode="iconAndLabel"
        cornerStyle="small"
        backgroundColor={tokens.bgElevatedHover}
        foregroundColor={tokens.textPrimary}
        style={{ width: 160, height: 48 }}
        onPress={(data) => {
          if (data.type === "text" && data.text.trim()) onPasteText(data.text);
        }}
      />
      <Text className="text-center font-body text-body text-ink-2">{hint}</Text>
    </View>
  );
}
