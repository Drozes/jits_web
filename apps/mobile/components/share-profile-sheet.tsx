import * as React from "react";
import { Share, Text, View } from "react-native";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { EloBadge } from "./elo-badge";
import { Info, Share2 } from "lucide-react-native";
import { toast } from "./ui/toast";

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

/**
 * Builds the shareable profile URL. Uses a fixed `https://jits.app` host so
 * shared links resolve via web during the alpha period (deep-linking comes
 * later).
 */
function profileUrl(athleteId: string) {
  return `https://jits.app/athlete/${athleteId}`;
}

export function ShareProfileSheet({ athlete, children }: ShareProfileSheetProps) {
  const url = profileUrl(athlete.id);

  async function handleShare() {
    try {
      await Share.share({
        title: `${athlete.displayName} on Jits Arena`,
        message: `Check out ${athlete.displayName}'s profile on Jits Arena: ${url}`,
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
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 items-center">
              <Text className="text-lg font-bold text-foreground">{athlete.displayName}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                <Text className="text-sm text-muted-foreground">ELO</Text>
                <EloBadge elo={athlete.elo} variant="compact" />
              </View>
              <Text className="text-sm text-muted-foreground mt-1">
                {athlete.wins}W - {athlete.losses}L
                {athlete.weight != null ? ` · ${athlete.weight} lbs` : ""}
              </Text>
              {athlete.gymName ? (
                <Text className="text-xs text-muted-foreground mt-0.5">{athlete.gymName}</Text>
              ) : null}
            </CardContent>
          </Card>

          <Button onPress={handleShare}>
            <Share2 size={16} className="text-primary-foreground" />
            <Text className="text-sm font-medium text-primary-foreground ml-2">Share Profile</Text>
          </Button>

          <View className="flex-row items-start gap-2">
            <Info size={14} className="text-muted-foreground mt-0.5" />
            <Text className="flex-1 text-xs text-muted-foreground">
              Shared profiles show your display name, ELO rating, and win/loss record. No personal information is included.
            </Text>
          </View>
        </View>
      </SheetContent>
    </Sheet>
  );
}
