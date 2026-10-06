import { Platform } from "react-native";

/**
 * FlatList tuning for the Matches feed. Feed cards are tall (16:9 media plus
 * the meta row), so the mounted window stays small: four rows on the first
 * frame, seven screens of window, and clipped subviews detached on Android
 * (iOS keeps them: detaching there has caused blank cells on fast scroll).
 * No getItemLayout: rows mix month headers and cards whose height varies
 * with the screen width, tags and the C-L6 helper, so any fixed layout
 * would be wrong. Its own module so screen tests can mount every row.
 */
export const FEED_LIST_TUNING = {
  initialNumToRender: 4,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === "android",
} as const;
