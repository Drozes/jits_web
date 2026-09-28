import { loadClipboardNative } from "./native-modules";

/**
 * Copy `text` to the system clipboard. False when the clipboard module is
 * not in this binary (every build before tier 2: the UI then renders the
 * caption as selectable text with "Press and hold the caption to copy it.")
 * or when the copy failed.
 */
export async function copyText(text: string): Promise<boolean> {
  const native = loadClipboardNative();
  if (!native) return false;
  try {
    const result = await native.setStringAsync(text, {});
    return result !== false;
  } catch {
    return false;
  }
}
