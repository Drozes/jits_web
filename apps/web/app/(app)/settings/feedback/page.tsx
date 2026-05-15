import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { FeedbackForm } from "./feedback-form";

export default function FeedbackPage() {
  return (
    <>
      <AppHeader title="Feedback" back />
      <PageContainer className="pt-6">
        <div
          className="flex flex-col animate-page-in"
          style={{ gap: "var(--space-4)" }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: "var(--lh-loose)",
            }}
          >
            Found a bug or have an idea? We read every submission.
          </p>
          <FeedbackForm />
        </div>
      </PageContainer>
    </>
  );
}
