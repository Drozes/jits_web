/**
 * Match-flow haptics. The vocabulary now lives in `@/lib/motion` (one
 * vocabulary for the whole app, Motion Rule); `matchHaptics` is the same
 * object under its historical name, so existing call sites and the suites
 * that mock this module keep working.
 */
export { haptics as matchHaptics } from "@/lib/motion/haptics";
