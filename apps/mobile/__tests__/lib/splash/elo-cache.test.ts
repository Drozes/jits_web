/**
 * The splash reveal's cached rating is versioned by rating model: after the
 * Rating V9 cutover a pre-V9 value (old 1000 scale) is never rolled to.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ELO_CACHE_KEY, getCachedElo, setCachedElo } from "@/lib/splash/elo-cache";

beforeEach(async () => {
  await AsyncStorage.clear();
});

it("ignores the pre-V9 key", async () => {
  await AsyncStorage.setItem("elo-rated:last-elo", "1012");
  expect(ELO_CACHE_KEY).not.toBe("elo-rated:last-elo");
  expect(await getCachedElo()).toBeNull();
});

it("round-trips a rating under the V9 key", async () => {
  await setCachedElo(1662.4);
  expect(await AsyncStorage.getItem(ELO_CACHE_KEY)).toBe("1662");
  expect(await getCachedElo()).toBe(1662);
});
