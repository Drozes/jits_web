import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";

export default function HelpPage() {
  return (
    <>
      <AppHeader title="Help & Support" back />
      <PageContainer className="pt-6">
        <p className="text-sm text-muted-foreground">
          Help and support resources will be available here. Check back soon for
          FAQs and contact options.
        </p>
      </PageContainer>
    </>
  );
}
