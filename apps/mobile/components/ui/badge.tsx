import * as React from "react";
import { Text, View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * `Badge`: a caps tag with tones, drawn as the ELO `MetaTag` (DESIGN.md
 * "Status and badges"): `radius-tag` (2px), a 1px border, no fill except
 * `secondary`, and a 10px mono caps label. Restyled onto ELO tokens by WP4
 * (R3 LG-2); the variant API is kept, including the custom `success`
 * variant.
 *
 * Tones (never a Signal Red fill: a tag is not a CTA):
 * - `default`: `hairline-strong` border, `ink` label (emphasis).
 * - `secondary`: `plate` fill, `hairline` border, `ink-2` label.
 * - `destructive`: `negative` border and label.
 * - `success`: `gain-green` border and label (gains and wins only).
 * - `outline`: `hairline` border, `ink-2` label (exactly `MetaTag`).
 */
const badgeVariants = cva(
  "self-start flex-row items-center border rounded-xs px-2 py-1",
  {
    variants: {
      variant: {
        default: "border-hairline-strong",
        secondary: "border-hairline bg-surface-3",
        destructive: "border-negative",
        success: "border-positive",
        outline: "border-hairline",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const badgeTextVariants = cva("font-mono text-micro uppercase tracking-caps-l", {
  variants: {
    variant: {
      default: "text-ink",
      secondary: "text-ink-2",
      destructive: "text-negative",
      success: "text-positive",
      outline: "text-ink-2",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps
  extends ViewProps,
    VariantProps<typeof badgeVariants> {
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
}

export function Badge({ className, textClassName, variant, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {typeof children === "string" ? (
        <Text className={cn(badgeTextVariants({ variant }), textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export { badgeVariants };
