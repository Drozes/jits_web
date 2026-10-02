import { Text, type TextProps } from "react-native";
import { cn } from "@/lib/cn";
import { TYPE_SCALE, type TypeStep } from "@/lib/typography";

type WordmarkSize = "sm" | "md" | "lg" | "hero";

interface WordmarkProps extends Omit<TextProps, "children"> {
  size?: WordmarkSize;
  className?: string;
}

const SIZE_STEP: Record<WordmarkSize, TypeStep> = {
  sm: "title",
  md: "title-xl",
  lg: "display-48",
  hero: "display-72",
};

export function Wordmark({ size = "md", className, style, ...rest }: WordmarkProps) {
  const px = TYPE_SCALE[SIZE_STEP[size]].fontSize;
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
