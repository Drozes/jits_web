import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { Plate } from "@/components/ui/elo-system";

export default function VideoSettingsPage() {
  return (
    <>
      <AppHeader title="Video Settings" back />
      <PageContainer className="pt-6">
        <div
          className="flex flex-col animate-page-in"
          style={{ gap: "var(--space-4)" }}
        >
          <Plate>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--size-body-s)",
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: "var(--lh-loose)",
              }}
            >
              Video recording settings will be available here. Match recordings
              can be configured for automatic or manual capture.
            </p>
          </Plate>
        </div>
      </PageContainer>
    </>
  );
}
