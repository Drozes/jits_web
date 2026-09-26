import { Pressable, Text } from "react-native";
import RNToast, {
  type ToastConfig,
  type ToastConfigParams,
  type ToastShowParams,
} from "react-native-toast-message";
import { cn } from "@/lib/cn";

/**
 * Toast wrapper around `react-native-toast-message`. Mirrors the `sonner` API
 * used on the web (`toast.success(...)`, `toast.error(...)`).
 *
 * Mounting: render `<Toaster />` once at the root of the app (sibling to the
 * navigation stack so it overlays). `app/_layout.tsx` already does, inside
 * `<ThemeProvider>`, so the NativeWind token classes below resolve.
 */

type ToastInput = string | (Omit<ToastShowParams, "type"> & { description?: string });

function normalize(input: ToastInput): ToastShowParams {
  if (typeof input === "string") return { text1: input };
  const { description, ...rest } = input;
  return { ...rest, text2: rest.text2 ?? description };
}

export const toast = {
  success(input: ToastInput) {
    RNToast.show({ type: "success", ...normalize(input) });
  },
  error(input: ToastInput) {
    RNToast.show({ type: "error", ...normalize(input) });
  },
  info(input: ToastInput) {
    RNToast.show({ type: "info", ...normalize(input) });
  },
  show(params: ToastShowParams) {
    RNToast.show(params);
  },
  hide() {
    RNToast.hide();
  },
};

/**
 * Left-rule colour per toast type. Success is neutral ink, NOT Gain Green
 * (green is reserved for rating increases); error is Signal Red (a failure
 * is state-negative); info is tertiary ink.
 */
const RULE_CLASS = {
  success: "border-l-ink",
  error: "border-l-cta",
  info: "border-l-ink-3",
} as const;

type BrandToastType = keyof typeof RULE_CLASS;

/**
 * ELO-branded toast card: elevated surface, hairline border, 4px radius, a
 * 3px left rule for the type, and no shadow or elevation (the brand builds
 * hierarchy from background shifts, never drop shadows). Replaces the
 * library's stock white card with its blue info rule.
 */
export function BrandToast({
  type,
  text1,
  text2,
  onPress,
}: {
  type: BrandToastType;
  text1?: string;
  text2?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      testID={`toast-${type}`}
      accessibilityRole="alert"
      onPress={onPress}
      className={cn(
        "mx-4 self-stretch gap-1 rounded-md border border-hairline-strong border-l-[3px] bg-surface-3 px-4 py-3",
        RULE_CLASS[type],
      )}
      style={{ shadowOpacity: 0, elevation: 0 }}
    >
      {text1 ? (
        <Text className="font-heading text-[13px] text-ink" numberOfLines={2}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text className="font-body text-[12px] text-ink-2" numberOfLines={3}>
          {text2}
        </Text>
      ) : null}
    </Pressable>
  );
}

function render(type: BrandToastType) {
  return ({ text1, text2, onPress }: ToastConfigParams<unknown>) => (
    <BrandToast type={type} text1={text1} text2={text2} onPress={onPress} />
  );
}

export const toastConfig: ToastConfig = {
  success: render("success"),
  error: render("error"),
  info: render("info"),
};

/** The library host, pre-wired with the branded config. */
export function Toaster() {
  return <RNToast config={toastConfig} />;
}

export default toast;
