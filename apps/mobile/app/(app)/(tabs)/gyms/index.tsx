import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Plus } from "lucide-react-native";
import { AppHeader } from "@/components/layout/app-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MetaTag } from "@/components/ui/elo-system";
import { GymCard } from "@/components/gyms/gym-card";
import { CreateGymSheet } from "@/components/gyms/create-gym-sheet";
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
import {
  SkeletonProvider,
  SkeletonPlate,
  SkeletonBlock,
  SkeletonText,
} from "@/components/ui/skeleton";
import { useCachedResource } from "@/lib/cache/use-cached-resource";
import type { GymListItem } from "@jits/shared/types/session";

interface GymCoords {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

interface GymsPayload {
  gyms: GymListItem[];
  coords: Record<string, GymCoords>;
}

const ALL_CITIES = "All Cities";

function useGymsList() {
  const resource = useCachedResource<GymsPayload>("gyms:list", async () => {
    // Already parallel: getGymsWithSessions is internally parallelized and the
    // coords SELECT is independent, so they run concurrently here.
    const [gyms, { data: gymRows }] = await Promise.all([
      getGymsWithSessions(supabase),
      supabase
        .from("gyms")
        .select("id, latitude, longitude")
        .eq("status", "active"),
    ]);
    const coords: Record<string, GymCoords> = {};
    for (const r of gymRows ?? []) {
      coords[r.id] = { id: r.id, latitude: r.latitude, longitude: r.longitude };
    }
    return { gyms, coords };
  });

  React.useEffect(() => {
    if (resource.error) toast.error("Failed to load gyms");
  }, [resource.error]);

  return {
    data: resource.data?.gyms ?? null,
    coords: resource.data?.coords ?? {},
    isLoading: resource.isLoading,
    isRefreshing: resource.isStale,
    refresh: resource.refetch,
  };
}

export default function GymsScreen() {
  const { athlete, isLoading: authLoading } = useRequireAthlete();
  const tokens = useThemedTokens();
  const { data, coords, isLoading, isRefreshing, refresh } = useGymsList();
  const location = useLocation();

  // Build the city set from loaded gyms.
  const cities = React.useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const g of data) if (g.city) set.add(g.city);
    return Array.from(set).sort();
  }, [data]);

  // Default city to the athlete's own city when it matches a known gym city.
  const defaultCity = React.useMemo(() => {
    const c = athlete?.city ?? null;
    return c && cities.includes(c) ? c : ALL_CITIES;
  }, [athlete?.city, cities]);

  const [city, setCity] = React.useState<string>(ALL_CITIES);
  // When defaults arrive after the first render, hydrate the city once.
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!hydratedRef.current && cities.length > 0) {
      hydratedRef.current = true;
      setCity(defaultCity);
    }
  }, [cities.length, defaultCity]);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    if (city === ALL_CITIES) return data;
    return data.filter((g) => (g.city ?? "") === city);
  }, [data, city]);

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
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color={tokens.accentCta} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader
        title="Gym Finder"
        rightAction={
          <CreateGymSheet onCreated={refresh}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create gym"
              className="w-8 h-8 items-center justify-center rounded-xs border border-hairline-strong bg-surface-3"
            >
              <Plus size={16} color={tokens.textSecondary} />
            </Pressable>
          </CreateGymSheet>
        }
      />

      <View className="px-4 pt-4 pb-3 gap-3">
        <CityField cities={cities} value={city} onChange={setCity} />

        <View className="flex-row items-center justify-between">
          <MetaTag>
            {enriched.length} Partner {enriched.length === 1 ? "Gym" : "Gyms"}
          </MetaTag>
          {location.isGranted !== true ? (
            <Pressable
              onPress={() => {
                if (location.isLoading) return;
                void location.request();
              }}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l">
                {location.isLoading ? "Locating..." : "Enable Location"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View className="px-4 pt-1">
          <GymsSkeleton />
        </View>
      ) : (
        <FlatList
          data={enriched}
          keyExtractor={(item) => item.gym.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 96, gap: 12 }}
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
            <View className="rounded-xs border border-dashed border-hairline p-8 items-center bg-surface-3">
              <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
                No Gyms Found
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={tokens.accentCta}
            />
          }
        />
      )}
    </View>
  );
}

/**
 * Cold-load placeholder for the gym list. Five default plates matching
 * GymCard/Plate rhythm: a gym-name block + right-aligned session-count block in
 * the header row, then a hairline-separated metadata line below. Static blocks
 * (no pulse) per the brand minimal-motion rule.
 */
function GymsSkeleton() {
  return (
    <SkeletonProvider>
      <View style={{ gap: 12 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonPlate key={i} variant="default">
            <View className="flex-row items-center justify-between gap-3 mb-2">
              <SkeletonBlock width="60%" height={16} radius="xs" />
              <SkeletonBlock width={64} height={20} radius="xs" />
            </View>
            <View className="border-t border-hairline pt-2">
              <SkeletonText lineHeight={12} />
            </View>
          </SkeletonPlate>
        ))}
      </View>
    </SkeletonProvider>
  );
}

function CityField({
  cities,
  value,
  onChange,
}: {
  cities: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        City
      </Text>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-surface-3 border border-hairline rounded-xs h-11 px-4">
          <SelectValue placeholder={ALL_CITIES} className="font-mono uppercase tracking-caps-l text-ink" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CITIES}>{ALL_CITIES}</SelectItem>
          {cities.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </View>
  );
}
