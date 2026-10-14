import type { Metadata } from "next";
import { SupportContact, SupportDeleteAccount, SupportLegal, SupportReport } from "@/components/support/support-sections";

export const metadata: Metadata = {
  title: "Support | ELO RATED",
  description: "Contact ELO RATED, delete your account, and read our Terms and Privacy Policy.",
  alternates: { canonical: "/support" },
};

/**
 * Public, static: the App Store Support URL (specs/web-landing/spec.md 7.4).
 * Lives in the (legal) group for its layout and public metadataBase.
 */
export default function SupportPage() {
  return (
    <article className="flex flex-col gap-3 font-body text-sm leading-relaxed text-foreground/90">
      <h1 className="font-heading text-2xl font-bold text-foreground">Support</h1>
      <p>Questions about ELO RATED, your account or a match? Email us.</p>
      <SupportContact />
      <SupportDeleteAccount />
      <SupportReport />
      <SupportLegal />
    </article>
  );
}
