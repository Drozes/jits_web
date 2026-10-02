import * as React from "react";
import { Share, Text, View } from "react-native";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Info, Share2 } from "lucide-react-native";
import { toast } from "./ui/toast";
import { Plate } from "./ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";

interface ShareProfileSheetProps {
  athlete: {
    id: string;
    displayName: string;
    elo: number;
    wins: number;
    losses: number;
    weight: number | null;
    gymName?: string | null;
  };
  children: React.ReactElement;
}

export function ShareProfileSheet({ athlete, children }: ShareProfileSheetProps) {
  const tokens = useThemedTokens();
  const url = buildShareUrl("athlete", athlete.id);
  const text = buildShareText({ type: "athlete", data: { displayName: athlete.displayName } });

  async function handleShare() {
    try {
      await Share.share({
        title: `${athlete.displayName} on ELO RATED`,
        message: `${text}: ${url}`,
        url,
      });
    } catch (err) {
      console.warn("[share-profile-sheet] share failed", err);
      toast.error("Could not share");
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent snapPoints={["50%"]}>
        <SheetHeader>
          <SheetTitle>Share Profile</SheetTitle>
        </SheetHeader>

        <View className="flex-col gap-4 pt-4">
          <Plate variant="accent">
            <View className="items-center gap-2">
              <Text className="font-heading text-subhead text-ink uppercase tracking-caps">
                {athlete.displayName}
              </Text>
              <View className="items-center">
                <Text className="font-mono tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
                  ELO Rating
                </Text>
                <Text className="font-mono-bold tabular-nums text-ink text-display-36" style={{ lineHeight: 43 }}>
                  {athlete.elo}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="font-mono text-ink text-small tabular-nums">{athlete.wins}W</Text>
                <Text className="font-mono tabular-nums text-ink-3 text-small">·</Text>
                <Text className="font-mono text-negative text-small tabular-nums">{athlete.losses}L</Text>
                {athlete.weight != null ? (
                  <>
                    <Text className="font-mono tabular-nums text-ink-3 text-small">·</Text>
                    <Text className="font-mono text-ink-2 text-small tabular-nums">{athlete.weight} lbs</Text>
                  </>
                ) : null}
              </View>
              {athlete.gymName ? (
                <Text className="font-body text-caption text-ink-3">{athlete.gymName}</Text>
              ) : null}
            </View>
          </Plate>

          <Button
            label="Share My Number"
            onPress={handleShare}
            icon={(color) => (
              <View pointerEvents="none">
                <Share2 size={16} color={color} />
              </View>
            )}
          />

          <View className="flex-row items-start gap-2">
            <Info size={14} color={tokens.textTertiary} style={{ marginTop: 2 }} />
            <Text className="flex-1 font-body text-caption text-ink-3">
              Shared profiles show your display name, ELO rating, and win/loss record. No personal information is included.
            </Text>
          </View>
        </View>
      </SheetContent>
    </Sheet>
  );
}
