import { AppHeader } from "@/components/layout/app-header";
import { PageContainer } from "@/components/layout/page-container";
import { DeleteAccountForm } from "./delete-account-form";

/**
 * Settings > Delete account (jits-b3js.10, App Store guideline 5.1.1(v) parity
 * on web). Auth is enforced by the (app) layout; the edge function re-verifies
 * the session JWT before deleting anything.
 */
export default function DeleteAccountPage() {
  return (
    <>
      <AppHeader title="Delete account" back />
      <PageContainer className="pt-6">
        <DeleteAccountForm />
      </PageContainer>
    </>
  );
}
