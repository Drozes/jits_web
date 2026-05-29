import { Text, type TextProps } from "react-native";
import { cn } from "@/lib/cn";

type WordmarkSize = "sm" | "md" | "lg" | "hero";

interface WordmarkProps extends Omit<TextProps, "children"> {
  size?: WordmarkSize;
  className?: string;
}

const SIZE_PX: Record<WordmarkSize, number> = {
  sm: 18,
  md: 22,
  lg: 48,
  hero: 72,
};

export function Wordmark({ size = "md", className, style, ...rest }: WordmarkProps) {
  const px = SIZE_PX[size];
  return (
    <Text
      className={cn("font-display text-ink tracking-mark", className)}
      style={[
        {
          fontSize: px,
          // CSS uses 0.85 line-height for display fonts (letters overflow the
          // line box). RN's Text clips at lineHeight, so descenders/ascenders
          // disappear. Use the full font-size as line-height to keep Bebas
          // Neue's tall caps fully visible.
          lineHeight: px,
        },
        style,
      ]}
      {...rest}
    >
      ELO RATED
    </Text>
  );
}
