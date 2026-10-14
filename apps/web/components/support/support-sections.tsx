import Link from "next/link";

/** Same typography as the legal documents (components/legal/legal-document.tsx). */
const H2 = "mt-4 font-heading text-lg font-bold text-foreground";
const LINK = "text-foreground underline underline-offset-2";

function Email() {
  return (
    <a href="mailto:info@elorated.com" className={LINK}>
      info@elorated.com
    </a>
  );
}

export function SupportContact() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={H2}>Contact</h2>
      <p>
        Email <Email />. Write from the email address on your account if you can, so we can find it.
      </p>
    </section>
  );
}

export function SupportDeleteAccount() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={H2}>Delete your account</h2>
      <p>
        In the app, go to Settings &gt; Delete account. Deletion cannot be undone, and you cannot delete your account in
        the middle of a live match.
      </p>
      <p>
        No app, or can&apos;t sign in? Email <Email /> from the email address on your account. We will verify the request
        and delete the account for you.
      </p>
      <p>
        Your match results stay on a de-identified &quot;Deleted athlete&quot; record so your opponents&apos; ratings stay
        accurate. Section 12 of our{" "}
        <Link href="/privacy#section-12" className={LINK}>
          Privacy Policy
        </Link>{" "}
        explains what is deleted and what is kept.
      </p>
    </section>
  );
}

export function SupportReport() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={H2}>Report a problem</h2>
      <p>
        To report content or an athlete, email <Email /> with the display name, the match and what happened. If anyone
        is in immediate danger, contact local emergency services first.
      </p>
    </section>
  );
}

export function SupportLegal() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={H2}>Legal</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li><Link href="/terms" className={LINK}>Terms of Service</Link></li>
        <li><Link href="/privacy" className={LINK}>Privacy Policy</Link></li>
        <li lang="fr"><Link href="/terms/fr" hrefLang="fr" className={LINK}>Conditions d&apos;utilisation</Link></li>
        <li lang="fr"><Link href="/privacy/fr" hrefLang="fr" className={LINK}>Politique de confidentialité</Link></li>
      </ul>
    </section>
  );
}
