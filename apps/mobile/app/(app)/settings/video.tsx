import { Text } from "react-native";
import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";

/**
 * Video settings stub. Mirrors apps/web/app/(app)/settings/video/page.tsx —
 * one Plate, lede copy, no controls yet (auto-record is the default).
 */
export default function SettingsVideoScreen() {
  return (
    <>
      <AppHeader title="Video Settings" back />
      <PageContainer
        noTabBar
        contentContainerStyle={{ paddingTop: 24, gap: 16 }}
      >
        <Plate>
          <Text className="font-body text-[12px] text-ink-2 leading-relaxed">
            Video recording settings will be available here. Match recordings
            can be configured for automatic or manual capture.
          </Text>
        </Plate>
      </PageContainer>
    </>
  );
}
