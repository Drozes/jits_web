import * as React from "react";
import { Image, Text, View, type ImageProps, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";

type AvatarSize = "sm" | "default" | "lg";
const AvatarContext = React.createContext<{
  size: AvatarSize;
  imageLoaded: boolean;
  setImageLoaded: (v: boolean) => void;
} | null>(null);

const useAvatar = () => {
  const ctx = React.useContext(AvatarContext);
  if (!ctx) throw new Error("Avatar subcomponents must be used inside <Avatar>");
  return ctx;
};

const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-6 w-6",
  default: "h-10 w-10",
  lg: "h-12 w-12",
};

export function Avatar({ size = "default", className, children, ...props }: ViewProps & { size?: AvatarSize; className?: string }) {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  return (
    <AvatarContext.Provider value={{ size, imageLoaded, setImageLoaded }}>
      <View className={cn("relative overflow-hidden rounded-full bg-muted", sizeClasses[size], className)} {...props}>
        {children}
      </View>
    </AvatarContext.Provider>
  );
}

export function AvatarImage({ className, source, onLoad, ...props }: ImageProps & { className?: string }) {
  const { setImageLoaded } = useAvatar();
  return (
    <Image
      source={source}
      onLoad={(e) => { setImageLoaded(true); onLoad?.(e); }}
      className={cn("h-full w-full", className)}
      {...props}
    />
  );
}

export function AvatarFallback({ className, textClassName, children, ...props }: ViewProps & { className?: string; textClassName?: string; children?: React.ReactNode }) {
  const { imageLoaded, size } = useAvatar();
  if (imageLoaded) return null;
  const textSize = size === "sm" ? "text-[10px]" : size === "lg" ? "text-base" : "text-sm";
  return (
    <View className={cn("absolute inset-0 items-center justify-center bg-muted", className)} {...props}>
      {typeof children === "string"
        ? <Text className={cn("font-medium text-muted-foreground", textSize, textClassName)}>{children}</Text>
        : children}
    </View>
  );
}
