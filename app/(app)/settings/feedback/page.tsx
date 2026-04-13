import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";

export default function FeedbackPage() {
  return (
    <>
      <AppHeader title="Feedback" back />
      <PageContainer className="pt-6">
        <p className="text-sm text-muted-foreground">
          We would love to hear from you. A feedback form will be available here
          soon.
        </p>
      </PageContainer>
    </>
  );
}
