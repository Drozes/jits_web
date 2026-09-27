import * as React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";

interface FilmBackButtonProps {
  /** Keep "Go back": the match-loop harness pops screens by that label. */
  label: string;
  /** Where to go when there is no history to pop (deep link, reload). */
  fallback: string;
  color: string;
  icon?: "back" | "close";
  testID?: string;
}

/**
 * A 44 pt back (or close) control for the Film Room screens, which draw their
 * own header over film. Pops when it can, else replaces with `fallback` so it
 * is never a dead button.
 */
export function FilmBackButton({ label, fallback, color, icon = "back", testID }: FilmBackButtonProps) {
  const router = useRouter();
  const Icon = icon === "close" ? X : ChevronLeft;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
      className="items-center justify-center active:opacity-70"
      style={{ width: 44, height: 44 }}
    >
      <Icon size={22} color={color} strokeWidth={2} />
    </Pressable>
  );
}
