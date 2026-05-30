import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_SPLASH_VARIANT,
  SPLASH_VARIANT,
  type SplashVariant,
} from "@jits/shared/constants";

const KEY = "elo-rated:splash-variant";
const VALID = new Set<string>(Object.values(SPLASH_VARIANT));

export async function getSplashVariant(): Promise<SplashVariant> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw != null && VALID.has(raw)) return raw as SplashVariant;
  } catch {
    // best-effort; fall through to default
  }
  return DEFAULT_SPLASH_VARIANT;
}

export async function setSplashVariant(variant: SplashVariant): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, variant);
  } catch {
    // best-effort cache; ignore failures
  }
}
