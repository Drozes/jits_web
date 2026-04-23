import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { FeedbackForm } from "./feedback-form";

export default function FeedbackPage() {
  return (
    <>
      <AppHeader title="Send Feedback" back />
      <PageContainer className="pt-6">
        <div className="flex flex-col gap-4 animate-page-in">
          <p className="text-sm text-muted-foreground">
            Found a bug or have an idea? We read every submission.
          </p>
          <FeedbackForm />
        </div>
      </PageContainer>
    </>
  );
}
