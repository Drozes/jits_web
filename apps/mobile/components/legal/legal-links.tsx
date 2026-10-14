import * as React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { LegalDocId } from "@jits/shared/legal/paths";
import { StatePressable } from "@/components/ui/state-pressable";
import { legalHref } from "@/lib/legal/legal-copy";

const LINKS: { doc: LegalDocId; label: string }[] = [
  { doc: "terms", label: "Read the full Terms of Service" },
  { doc: "privacy", label: "Read the Privacy Policy" },
];

/**
 * The two links that open the full Terms of Service and Privacy Policy in
 * the legal modal (`app/legal/[doc].tsx`), under an agreement checkbox
 * (profile setup, invite setup). Each is a full 44pt row.
 */
export function LegalLinks() {
  const router = useRouter();
  return (
    <View>
      {LINKS.map(({ doc, label }) => (
        <StatePressable
          key={doc}
          dim
          testID={`legal-link-${doc}`}
          accessibilityRole="link"
          accessibilityHint="Opens the full text"
          onPress={() => router.push(legalHref(doc))}
          className="min-h-[44px] flex-row items-center px-1"
        >
          <Text className="font-body-medium text-callout text-ink underline">{label}</Text>
        </StatePressable>
      ))}
    </View>
  );
}
