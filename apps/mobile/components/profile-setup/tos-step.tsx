import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { TOS_TEXT } from "@jits/shared/utils";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";
import { cn } from "@/lib/cn";

interface TosStepProps {
  onAccept: () => void | Promise<void>;
  onExit?: () => void;
  submittingExternal?: boolean;
}

interface ParsedBlock {
  type: "title" | "section" | "paragraph";
  label?: string;
  body: string;
}

function parseEuaBody(raw: string): ParsedBlock[] {
  const lines = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const blocks: ParsedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      blocks.push({ type: "title", body: line });
      continue;
    }
    const sectionMatch = /^(\d+\.\s+[^\n]+)/.exec(line);
    if (sectionMatch) {
      const firstLine = sectionMatch[1];
      const rest = line.slice(firstLine.length).trim();
      blocks.push({ type: "section", label: firstLine, body: rest });
    } else {
      blocks.push({ type: "paragraph", body: line });
    }
  }
  return blocks;
}

/**
 * EUA / TOS step. Wireframe A3 visual: Plate-wrapped TOS body (scrollable),
 * checkbox row, primary "I Acknowledge" CTA, secondary "Exit" link.
 */
export function TosStep({ onAccept, onExit, submittingExternal }: TosStepProps) {
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const isBusy = submitting || submittingExternal;
  const blocks = React.useMemo(() => parseEuaBody(TOS_TEXT), []);

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
      <Plate style={{ maxHeight: 360 }}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentContainerStyle={{ paddingBottom: 4 }}
        >
          {blocks.map((block, i) => {
            if (block.type === "title") {
              return (
                <Text
                  key={i}
                  className="font-heading text-callout text-ink uppercase tracking-caps mb-3"
                >
                  {block.body.toUpperCase()}
                </Text>
              );
            }
            if (block.type === "section") {
              return (
                <View key={i} className="mb-3">
                  <Text className="font-heading-medium text-body text-ink leading-6">
                    {block.label}
                  </Text>
                  {block.body ? (
                    <Text className="font-body text-body text-ink-2 leading-6">
                      {block.body}
                    </Text>
                  ) : null}
                </View>
              );
            }
            return (
              <Text
                key={i}
                className="font-body text-body text-ink-2 leading-6 mb-3"
              >
                {block.body}
              </Text>
            );
          })}
        </ScrollView>
      </Plate>

      <StatePressable
        dim
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        onPress={() => setAgreed((v) => !v)}
        className="flex-row items-center gap-3 px-1"
      >
        <View
          className={cn(
            "h-5 w-5 items-center justify-center rounded-xs border",
            selectionSurface(agreed),
          )}
        >
          {agreed ? <SelectCheck size={13} /> : null}
        </View>
        <Text className="font-body text-callout text-ink flex-1">
          I agree to the End User Agreement
        </Text>
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
