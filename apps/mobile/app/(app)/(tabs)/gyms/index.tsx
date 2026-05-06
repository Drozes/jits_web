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
import { MapPin } from "lucide-react-native";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GymCard } from "@/components/gyms/gym-card";
import { useRequireAthlete } from "@/lib/auth/hooks";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { supabase } from "@/lib/supabase/client";
import { getGymsWithSessions } from "@jits/shared/api/queries";
import {
  formatDistanceKm,
  haversineKm,
  useLocation,
} from "@/lib/location/use-location";
import { toast } from "@/components/ui";
import type { GymListItem } from "@jits/shared/types/session";

interface GymCoords {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

function useGymsList() {
  const [data, setData] = React.useState<GymListItem[] | null>(null);
  const [coords, setCoords] = React.useState<Record<string, GymCoords>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchAll = React.useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const [gyms, { data: gymRows }] = await Promise.all([
        getGymsWithSessions(supabase),
        supabase
          .from("gyms")
          .select("id, latitude, longitude")
          .eq("status", "active"),
      ]);
      setData(gyms);
      const map: Record<string, GymCoords> = {};
      for (const r of gymRows ?? []) {
        map[r.id] = { id: r.id, latitude: r.latitude, longitude: r.longitude };
      }
      setCoords(map);
    } catch (err) {
      console.error("[gyms] fetch failed", err);
      toast.error("Failed to load gyms");
    } finally {
      if (mode === "initial") setIsLoading(false);
      else setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchAll("initial");
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  return {
    data,
    coords,
    isLoading,
    isRefreshing,
    refresh: () => fetchAll("refresh"),
  };
}

export default function GymsScreen() {
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const tokens = useThemedTokens();
  const { data, coords, isLoading, isRefreshing, refresh } = useGymsList();
  const location = useLocation();
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.city && g.city.toLowerCase().includes(q)),
    );
  }, [data, query]);

  // Compute distances from user position; sort by distance when available.
  const enriched = React.useMemo(() => {
    if (!location.position) {
      return filtered.map((g) => ({ gym: g, distanceKm: null as number | null }));
    }
    const pos = location.position;
    return filtered
      .map((g) => {
        const c = coords[g.id];
        if (c?.latitude == null || c.longitude == null) {
          return { gym: g, distanceKm: null };
        }
        return {
          gym: g,
          distanceKm: haversineKm(pos, { latitude: c.latitude, longitude: c.longitude }),
        };
      })
      .sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [filtered, coords, location.position]);

  if (authLoading || !athlete) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center gap-2 mb-3">
          <MapPin size={20} color={tokens.primary} />
          <Text className="text-2xl font-heading text-foreground">Gyms</Text>
        </View>
        <Input
          placeholder="Search gyms..."
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {location.isGranted !== true ? (
          <Pressable
            onPress={() => {
              if (location.isLoading) return;
              void location.request();
            }}
            className="mt-3 rounded-md border border-dashed border-border p-3"
          >
            <Text className="text-sm font-medium text-foreground">
              {location.isLoading
                ? "Requesting location..."
                : location.isGranted === false
                  ? "Location denied. Enable in Settings to see distance."
                  : "Enable location to see distance to each gym"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : (
        <FlatList
          data={enriched}
          keyExtractor={(item) => item.gym.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
          renderItem={({ item }) => (
            <GymCard
              gym={item.gym}
              isMyGym={item.gym.id === athlete.primary_gym_id}
              distanceLabel={
                item.distanceKm != null ? formatDistanceKm(item.distanceKm) : null
              }
            />
          )}
          ListEmptyComponent={
            <View className="rounded-md border border-dashed border-border p-8 items-center">
              <Text className="text-sm text-muted-foreground">No gyms found</Text>
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
      )}
    </SafeAreaView>
  );
}
