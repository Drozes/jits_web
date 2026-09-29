import { Text } from "react-native";
import { formatAppVersion, readAppVersionInfo } from "@/lib/updates/app-version";

/** Small mono build/OTA stamp for the profile footer and login screen. */
export function AppVersionLabel() {
  return (
    <Text
      testID="app-version-label"
      className="text-center font-mono text-[9px] text-ink-3 tracking-caps"
    >
      {formatAppVersion(readAppVersionInfo())}
    </Text>
  );
}
