import RNToast, { type ToastShowParams } from "react-native-toast-message";

/**
 * Toast wrapper around `react-native-toast-message`. Mirrors the `sonner` API
 * used on the web (`toast.success(...)`, `toast.error(...)`).
 *
 * Mounting: B3 owns `app/_layout.tsx`. To activate, render `<Toaster />` once
 * at the root of the app (sibling to the navigation stack so it overlays).
 *
 * Example (in B3-owned `_layout.tsx`):
 *   import { Toaster } from "@/components/ui/toast";
 *   ...
 *   return (
 *     <GestureHandlerRootView style={{ flex: 1 }}>
 *       <Stack ... />
 *       <Toaster />
 *     </GestureHandlerRootView>
 *   );
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

export const Toaster = RNToast;

export default toast;
