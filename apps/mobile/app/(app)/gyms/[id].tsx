import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, MapPin, Users, Calendar } from "lucide-react-native";
import { Badge } from "@/components/ui/badge";
import { SessionCard } from "@/components/session-card";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getGymDetail } from "@jits/shared/api/queries";
import { toast } from "@/components/ui";
import type { GymDetail } from "@jits/shared/types/session";
import {
  formatDistanceKm,
  haversineKm,
  useLocation,
} from "@/lib/location/use-location";

interface GymCoords {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

function useGymDetailData(gymId: string | undefined, athleteId: string | undefined) {
  const [data, setData] = React.useState<GymDetail | null>(null);
  const [coords, setCoords] = React.useState<GymCoords | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(
    async (mode: "initial" | "refresh") => {
      if (!gymId || !athleteId) return;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      try {
        const [detail, { data: gymRow }] = await Promise.all([
          getGymDetail(supabase, gymId, athleteId),
          supabase
            .from("gyms")
            .select("latitude, longitude, address")
            .eq("id", gymId)
            .maybeSingle(),
        ]);
        setData(detail);
        if (gymRow) {
          setCoords({
            latitude: gymRow.latitude,
            longitude: gymRow.longitude,
            address: gymRow.address,
          });
        }
      } catch (err) {
        console.error("[gym-detail] fetch failed", err);
        toast.error("Failed to load gym");
      } finally {
        if (mode === "initial") setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    [gymId, athleteId],
  );

  React.useEffect(() => {
    void fetchAll("initial");
  }, [fetchAll]);

  return { data, coords, isLoading, isRefreshing, refresh: () => fetchAll("refresh") };
}

export default function GymDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const { data, coords, isLoading, isRefreshing, refresh } = useGymDetailData(
    id,
    athlete?.id,
  );
  const location = useLocation();

  const distanceKm = React.useMemo(() => {
    if (!location.position || !coords?.latitude || !coords?.longitude) return null;
    return haversineKm(location.position, {
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  }, [location.position, coords]);

  if (authLoading || isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={20} color={tokens.foreground} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base font-medium text-foreground">Gym not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const rsvpSet = new Set(data.rsvpSessionIds);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ArrowLeft size={20} color={tokens.foreground} />
        </Pressable>
        <Text className="ml-2 text-base font-semibold text-foreground">Gym</Text>
      </View>

      <FlatList
        data={data.sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          <View className="gap-3 mb-2">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-2xl font-bold text-foreground">{data.name}</Text>
              {data.isMemberGym ? (
                <Badge variant="outline">
                  <Text className="text-[10px] font-semibold text-foreground">My Gym</Text>
                </Badge>
              ) : null}
            </View>
            {data.city || coords?.address ? (
              <View className="flex-row items-center gap-1.5">
                <MapPin size={14} color={tokens.mutedForeground} />
                <Text className="text-sm text-muted-foreground">
                  {coords?.address ? coords.address : data.city}
                  {distanceKm != null ? ` · ${formatDistanceKm(distanceKm)}` : ""}
                </Text>
              </View>
            ) : null}
            <View className="flex-row items-center gap-1.5">
              <Users size={14} color={tokens.mutedForeground} />
              <Text className="text-sm text-muted-foreground">Members at this gym</Text>
            </View>
            {location.isGranted !== true ? (
              <Pressable
                onPress={() => {
                  if (location.isLoading) return;
                  void location.request();
                }}
                className="rounded-md border border-dashed border-border p-3"
              >
                <Text className="text-sm font-medium text-foreground">
                  {location.isLoading
                    ? "Requesting location..."
                    : "Enable location to see distance"}
                </Text>
              </Pressable>
            ) : null}

            <View className="flex-row items-center gap-2 mt-3">
              <Calendar size={18} color={tokens.primary} />
              <Text className="text-lg font-semibold text-foreground">Sessions</Text>
              {data.sessions.length > 0 ? (
                <View className="ml-1 px-2 py-0.5 rounded-full bg-muted">
                  <Text className="text-[11px] font-bold text-muted-foreground">
                    {data.sessions.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <SessionCard session={item} isRsvpd={rsvpSet.has(item.id)} />
        )}
        ListEmptyComponent={
          <View className="rounded-md border border-dashed border-border p-8 items-center">
            <Text className="text-sm text-muted-foreground">No upcoming sessions</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={tokens.primary}
          />
        }
      />
    </SafeAreaView>
  );
}
