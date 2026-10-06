import * as React from "react";
import { Linking, Text, View } from "react-native";
import { SHARE_COPY } from "@/lib/highlight-share";
import { Button } from "@/components/ui/elo-system/button";
import { VIEWER_COPY } from "./viewer-copy";

/** The last Save to Photos was refused by the Photos permission: inline copy + "Settings" (C-V9, a11y "Open Settings"). */
export function ViewerSavePermission() {
  return (
    <View testID="viewer-save-permission" className="gap-2 py-1">
      <Text className="font-body text-small text-ink-2">{SHARE_COPY.savePermissionDenied}</Text>
      <Button
        height={44}
        testID="viewer-open-settings"
        label={VIEWER_COPY.settings}
        accessibilityLabel={SHARE_COPY.openSettings}
        variant="ghost"
        className="self-center"
        onPress={() => void Linking.openSettings().catch(() => undefined)}
      />
    </View>
  );
}
