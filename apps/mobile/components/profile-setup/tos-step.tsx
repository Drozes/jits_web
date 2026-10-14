import * as React from "react";
import { Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { TermsKeyPoints } from "@/components/legal/terms-key-points";
import { LegalLinks } from "@/components/legal/legal-links";
import { LEGAL_AGREE_LABEL } from "@/lib/legal/legal-copy";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";
import { cn } from "@/lib/cn";

interface TosStepProps {
  onAccept: () => void | Promise<void>;
  onExit?: () => void;
  submittingExternal?: boolean;
}

/**
 * EUA / TOS step. Wireframe A3 visual: a Plate with the Terms' own "Key
 * points" summary (scrollable), links to the full Terms and the Privacy
 * Policy (the legal modal), checkbox row, primary "I Acknowledge" CTA,
 * secondary "Exit" link.
 *
 * Why the key points and not the full text here: the full Terms are about
 * 12k words, too long to read in a 360pt box nested in the wizard's own
 * ScrollView (and too slow to draw there unvirtualized). The Terms open with
 * the key points as their "please read" summary, including the waiver in
 * Section 5, and the full text is one tap away in a virtualized modal.
 * Recording which version was accepted and the second checkbox are
 * jits-rog5.2.
 */
export function TosStep({ onAccept, onExit, submittingExternal }: TosStepProps) {
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const isBusy = submitting || submittingExternal;

  async function handleContinue() {
    if (!agreed || isBusy) return;
    setSubmitting(true);
    try {
      await onAccept();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Plate>
        <TermsKeyPoints maxHeight={328} />
      </Plate>

      <LegalLinks />

      <StatePressable
        dim
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => setAgreed((v) => !v)}
        accessibilityLabel={LEGAL_AGREE_LABEL}
        className="flex-row items-start gap-3 px-1"
      >
        <View
          className={cn(
            "mt-0.5 h-5 w-5 items-center justify-center rounded-xs border",
            selectionSurface(agreed),
          )}
        >
          {agreed ? <SelectCheck size={13} /> : null}
        </View>
        <Text className="font-body text-callout text-ink flex-1 leading-5">{LEGAL_AGREE_LABEL}</Text>
      </StatePressable>

      <Button
        label={isBusy ? "Saving..." : "I Acknowledge"}
        onPress={handleContinue}
        disabled={!agreed || isBusy}
      />
      {onExit ? (
        <Button variant="ghost" height={44} label="Exit" onPress={onExit} disabled={isBusy} />
      ) : null}
    </View>
  );
}
