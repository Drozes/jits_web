import * as React from "react";
import { Text, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { PressableScale, type PressHaptic } from "./pressable-scale";
import { SteelSheen } from "./steel-sheen";

const buttonVariants = cva(
  // Press feedback is the Motion Rule's press scale (PressableScale), not an
  // `active:` opacity class.
  "flex-row items-center justify-center gap-2 rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        destructive: "bg-destructive",
        outline: "border border-input bg-background",
        secondary: "bg-secondary",
        ghost: "bg-transparent",
        link: "bg-transparent",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
    size: { default: "", sm: "text-xs", lg: "text-base", icon: "" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps
  extends Omit<PressableProps, "children" | "style">,
    VariantProps<typeof buttonVariants> {
  className?: string;
  textClassName?: string;
  /** A plain style (a function `style` is not supported on a Button). */
  style?: StyleProp<ViewStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
  /**
   * Commit-action haptic on press (Motion Rule): `true`/`"press"` for a
   * commit action (Challenge, Go live, Confirm result), `"accept"` for the
   * waiting-on-you Accept. Omitted: silent.
   */
  haptic?: PressHaptic;
  /**
   * Steel sheen (Motion Rule, Ambient): true while this button's action is
   * waiting on THIS user. At most one sheened button per screen; only the
   * incoming-challenge Accept and the match-flow Confirm result use it.
   * Never drawn on a disabled button or under Reduce Motion.
   */
  sheen?: boolean;
}

/**
 * Every Button gets the Motion Rule's press scale (0.97, spring back; an
 * opacity dip under Reduce Motion). Disabled buttons do not scale or buzz.
 */
export const Button = React.forwardRef<View, ButtonProps>(
  (
    {
      className,
      textClassName,
      variant,
      size,
      leftIcon,
      rightIcon,
      disabled,
      children,
      haptic,
      sheen = false,
      ...props
    },
    ref,
  ) => (
    <PressableScale
      ref={ref}
      disabled={disabled}
      haptic={haptic}
      className={cn(
        buttonVariants({ variant, size }),
        disabled && "opacity-50",
        sheen && "overflow-hidden",
        className,
      )}
      accessibilityRole="button"
      hitSlop={size === "sm" || size === "icon" ? 8 : undefined}
      {...props}
    >
      {leftIcon}
      {typeof children === "string" ? (
        <Text className={cn(buttonTextVariants({ variant, size }), textClassName)}>{children}</Text>
      ) : (
        children
      )}
      {rightIcon}
      <SteelSheen active={sheen && !disabled} />
    </PressableScale>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
