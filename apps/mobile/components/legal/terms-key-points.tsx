import * as React from "react";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { TERMS_EN, firstSection, parseLegalDocument, type LegalBlock, type LegalRefTarget } from "@jits/shared/legal";
import { legalHref } from "@/lib/legal/legal-copy";
import { LegalBlocks } from "./legal-document";

let cached: LegalBlock[] | null = null;

/**
 * The Terms' own "Key points (please read)" section, parsed once from
 * TERMS.md with its references linked against the whole document.
 */
export function termsKeyPoints(): LegalBlock[] {
  cached ??= firstSection(parseLegalDocument("terms", TERMS_EN.markdown));
  return cached;
}

/**
 * The waiver notice shown before an athlete agrees (profile setup and invite
 * setup, jits-rog5.8): the Terms' key points, extracted from the final
 * TERMS.md (never hand-copied), in a short scroll box. The Section 5 waiver
 * is the first bullet, at the top of the box, so it is seen without
 * scrolling. The full Terms are one tap away in the legal modal; scrolling
 * all 12k words here would be unreadable and slow (owner decision). Its
 * references open the modal there: "SECTION 5" opens the Terms at Section 5,
 * "Privacy Policy" opens the Privacy Policy (jits-rog5.10).
 */
export function TermsKeyPoints({ maxHeight }: { maxHeight: number }) {
  const blocks = React.useMemo(termsKeyPoints, []);
  const router = useRouter();
  const onRef = React.useCallback(
    (t: LegalRefTarget) => router.push(legalHref(t.doc, undefined, t.section)),
    [router],
  );
  return (
    <ScrollView
      testID="terms-key-points"
      style={{ maxHeight }}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      contentContainerStyle={{ paddingBottom: 4 }}
    >
      <LegalBlocks blocks={blocks} onRef={onRef} />
    </ScrollView>
  );
}
