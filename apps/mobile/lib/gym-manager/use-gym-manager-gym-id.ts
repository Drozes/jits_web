import { useLocalSearchParams, type Href } from "expo-router";
import { useManagedGyms } from "@/lib/gym-manager/use-managed-gyms";
import type { ManagedGym } from "@jits/shared/api/queries";

export interface GymManagerGymContext {
  /** The gym every screen in the portal should read, or undefined if none. */
  gymId: string | undefined;
  /** The matching managed-gym row, for the name and any other metadata. */
  gym: ManagedGym | undefined;
  /** Every gym this athlete manages. */
  gyms: ManagedGym[];
  /** True once the managed-gym lookup has resolved at least once. */
  isReady: boolean;
}

/**
 * Resolves which gym the gym-owner portal is currently showing.
 *
 * The portal is entered from `/gyms/[id]`, which passes that gym through as a
 * `gymId` route param, and every internal link inside the portal carries the
 * param forward (see `managerHref`). A manager of several gyms therefore sees
 * the gym they opened, not always the first one; before the param existed every
 * screen independently took `gyms[0]`, so gyms 2..n were unreachable on mobile.
 *
 * The param is validated against the athlete's managed gyms rather than trusted:
 * an unknown or unmanaged id falls back to the first managed gym, so a
 * hand-crafted deep link cannot point the manager-gated queries at a gym the
 * athlete does not manage. (The RPCs are manager-gated server side as well; this
 * just keeps the client from rendering a guaranteed-empty screen.)
 */
export function useGymManagerGymId(): GymManagerGymContext {
  const { gymId: gymIdParam } = useLocalSearchParams<{ gymId?: string }>();
  const { gyms, isReady } = useManagedGyms();

  const fromParam = gyms.find((g) => g.gymId === gymIdParam);
  const gym = fromParam ?? gyms[0];

  return { gymId: gym?.gymId, gym, gyms, isReady };
}

/**
 * Builds a link inside the gym-owner portal with the active gym carried along,
 * so the destination screen resolves the same gym instead of falling back to
 * the first managed one. Used for both navigation and AppHeader `backFallback`.
 */
export function managerHref(
  pathname: string,
  gymId: string | undefined,
  extraParams?: Record<string, string>,
): Href {
  const params: Record<string, string> = {
    ...(extraParams ?? {}),
    ...(gymId ? { gymId } : {}),
  };
  return Object.keys(params).length > 0 ? { pathname, params } : pathname;
}
