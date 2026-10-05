import * as React from "react";
import { AccessibilityInfo, Pressable, Text } from "react-native";
import RNToast, {
  type ToastConfig,
  type ToastConfigParams,
  type ToastShowParams,
} from "react-native-toast-message";
import * as SafeArea from "react-native-safe-area-context";
import { cn } from "@/lib/cn";

/** The header bar's height below the safe area (`BrandHeader`, `TabHeader`, `AppHeader`). */
const HEADER_BAR_HEIGHT = 56;

/**
 * Where toasts sit: below the status bar AND the header bar, so a toast never
 * covers the wordmark or the header status chip it is often about (review
 * round 1, UX defect 6). The library default (40 pt) sat under the Dynamic
 * Island and over the header. No safe area provider (tests): just the bar.
 */
/** Read once: a test double of the library may not export the context. */
const InsetsContext: React.Context<{ top: number } | null> =
  (SafeArea as { SafeAreaInsetsContext?: React.Context<{ top: number } | null> }).SafeAreaInsetsContext ??
  React.createContext<{ top: number } | null>(null);

/**
 * Extra room a screen asks for below the header (QA C: the Arena's sticky
 * OFFLINE / LIVE control bar). The focused screen sets it; 0 elsewhere.
 */
let extraTop = 0;
const extraListeners = new Set<() => void>();

function subscribeExtra(cb: () => void): () => void {
  extraListeners.add(cb);
  return () => {
    extraListeners.delete(cb);
  };
}

function getExtra(): number {
  return extraTop;
}

/**
 * While `active` (the screen is focused), toasts sit `px` lower, below the
 * screen's own sticky bar. Released on blur and unmount.
 */
export function useToastBelowScreenBar(active: boolean, px: number): void {
  React.useEffect(() => {
    if (!active) return;
    extraTop = px;
    for (const l of [...extraListeners]) l();
    return () => {
      if (extraTop === px) extraTop = 0;
      for (const l of [...extraListeners]) l();
    };
  }, [active, px]);
}

export function useToastTopOffset(): number {
  const insets = React.useContext(InsetsContext);
  const extra = React.useSyncExternalStore(subscribeExtra, getExtra, getExtra);
  return (insets?.top ?? 0) + HEADER_BAR_HEIGHT + extra + 4;
}

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

/** The library's own default, for a toast that does not set one. */
const DEFAULT_VISIBILITY_MS = 4000;

/**
 * The toast most recently shown through this module, so a host that is torn
 * down while showing it (the in-modal `ModalToaster`) can hand it to the host
 * underneath. `seq` orders shows; `hidden` flips when the toast hides by any
 * route (auto-hide, a tap, a swipe, `toast.hide()`) or is replaced.
 */
type ShownToast = { seq: number; at: number; params: ToastShowParams; hidden: boolean };
let showSeq = 0;
let lastShown: ShownToast | null = null;

function showTracked(params: ToastShowParams) {
  if (lastShown) lastShown.hidden = true;
  const userOnHide = params.onHide;
  const entry: ShownToast = { seq: ++showSeq, at: Date.now(), params, hidden: false };
  entry.params = {
    ...params,
    onHide: () => {
      entry.hidden = true;
      userOnHide?.();
    },
  };
  lastShown = entry;
  RNToast.show(entry.params);
}

/** Test-only: forget the tracked toast between tests. */
export function __resetToastTrackingForTests() {
  showSeq = 0;
  lastShown = null;
}

/**
 * Shows the toast and reads it out to VoiceOver, which does not otherwise
 * notice a toast appearing over the current screen.
 */
function showAndAnnounce(type: "success" | "error" | "info", input: ToastInput) {
  const params = normalize(input);
  showTracked({ type, ...params });
  if (params.text1) {
    AccessibilityInfo.announceForAccessibility(
      params.text1 + (params.text2 ? ". " + params.text2 : ""),
    );
  }
}

export const toast = {
  success(input: ToastInput) {
    showAndAnnounce("success", input);
  },
  error(input: ToastInput) {
    showAndAnnounce("error", input);
  },
  info(input: ToastInput) {
    showAndAnnounce("info", input);
  },
  show(params: ToastShowParams) {
    showTracked(params);
  },
  hide() {
    if (lastShown) lastShown.hidden = true;
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
        <Text className="font-heading text-body text-ink" numberOfLines={2}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text className="font-body text-small text-ink-2" numberOfLines={3}>
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

// Any other type (e.g. a raw `toast.show({ type: "custom" })`) throws at
// render: the library only knows success, error and info, all overridden here.
export const toastConfig: ToastConfig = {
  success: render("success"),
  error: render("error"),
  info: render("info"),
};

/** The library host, pre-wired with the branded config. */
export function Toaster() {
  return <RNToast config={toastConfig} topOffset={useToastTopOffset()} />;
}

/**
 * A second host for inside a React Native `<Modal>`, which renders above the
 * root `<Toaster />`. The library routes `toast.*` to the newest mounted host
 * and keeps the toast's state in that host, so a toast raised just before
 * the modal's host unmounts (an action that fails and clears the modal in
 * the same flow) would vanish with it. On unmount this re-shows such a toast
 * on the host underneath for the rest of its visibility window. Deferred one
 * tick so the library has already dropped this host's ref and routes the
 * re-show to the root host.
 */
export function ModalToaster() {
  React.useEffect(() => {
    const mountedSeq = showSeq;
    return () => {
      const entry = lastShown;
      if (!entry || entry.hidden || entry.seq <= mountedSeq) return;
      const autoHide = entry.params.autoHide ?? true;
      const total = entry.params.visibilityTime ?? DEFAULT_VISIBILITY_MS;
      const remaining = total - (Date.now() - entry.at);
      if (autoHide && remaining <= 0) return;
      setTimeout(() => {
        // Replaced or hidden in the meantime: nothing to hand over.
        if (lastShown !== entry || entry.hidden) return;
        RNToast.show({ ...entry.params, visibilityTime: autoHide ? remaining : total });
      }, 0);
    };
  }, []);
  return <RNToast config={toastConfig} topOffset={useToastTopOffset()} />;
}

export default toast;
