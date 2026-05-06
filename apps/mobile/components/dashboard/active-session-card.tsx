import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MapPin, Users } from "lucide-react-native";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import type { ActiveSessionInfo } from "@jits/shared/types/session";

interface ActiveSessionCardProps {
  session: ActiveSessionInfo | null;
}

function formatStartsIn(scheduledStart: string) {
  const diff = new Date(scheduledStart).getTime() - Date.now();
  if (diff <= 0) return "Starting now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Starts in ${mins}m`;
  const hours = Math.floor(mins / 60);
  return `Starts in ${hours}h ${mins % 60}m`;
}

export function ActiveSessionCard({ session }: ActiveSessionCardProps) {
  const router = useRouter();

  if (!session) {
    return (
      <Pressable
        onPress={() => router.push("/(app)/gyms")}
        className="active:opacity-80"
        accessibilityRole="button"
      >
        <Card className="border-dashed p-6 items-center">
          <MapPin size={24} className="text-muted-foreground mb-2" />
          <Text className="text-sm font-medium text-foreground">Find a session</Text>
          <Text className="text-xs text-muted-foreground mt-1">
            Browse gyms and join an open mat
          </Text>
        </Card>
      </Pressable>
    );
  }

  if (session.status === "active") {
    const target = session.isCheckedIn
      ? `/(app)/session/${session.sessionId}/lobby`
      : `/(app)/session/${session.sessionId}/join`;
    return (
      <Card className="border-success/30 bg-success/5 p-4">
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Badge variant="success">Live</Badge>
              <Text className="text-sm font-heading text-foreground" numberOfLines={1}>
                Session at {session.gymName}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Users size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">
              {session.participantCount} checked in
            </Text>
          </View>
          <Button size="sm" className="mt-1" onPress={() => router.push(target)}>
            <Text className="text-sm font-medium text-primary-foreground">
              {session.isCheckedIn ? "Go to Lobby" : "Check In"}
            </Text>
          </Button>
        </View>
      </Card>
    );
  }

  // Scheduled
  return (
    <Card className="p-4">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-heading text-foreground flex-1" numberOfLines={1}>
            Upcoming at {session.gymName}
          </Text>
          <Badge variant="secondary">{formatStartsIn(session.scheduledStart)}</Badge>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Users size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">
            {session.participantCount} checked in
          </Text>
        </View>
      </View>
    </Card>
  );
}
