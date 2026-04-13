import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";

export default function VideoSettingsPage() {
  return (
    <>
      <AppHeader title="Video Settings" back />
      <PageContainer className="pt-6">
        <p className="text-sm text-muted-foreground">
          Video recording settings will be available here. Match recordings can
          be configured for automatic or manual capture.
        </p>
      </PageContainer>
    </>
  );
}
