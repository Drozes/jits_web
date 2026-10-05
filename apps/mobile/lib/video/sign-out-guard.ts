import { Alert } from "react-native";
import { hasPendingMatchUploads } from "./upload-control";

export const SIGN_OUT_UPLOAD_TITLE = "Film still uploading";

/** The warning body, naming who has to sign back in for it to finish. */
export function signOutUploadMessage(displayName: string | null | undefined): string {
  const who = displayName?.trim() ? ` as ${displayName.trim()}` : "";
  return `Your match film hasn't finished uploading. Sign out anyway? It will finish the next time you sign in${who}.`;
}

/**
 * The sign-out warning when this athlete still owes the server a video (a
 * running, paused or failed upload), else null (jits-n2im.6). Signing out
 * stops the uploads and they resume only for the same athlete, so the
 * athlete should know before they leave.
 */
export async function pendingUploadSignOutMessage(
  displayName: string | null | undefined,
): Promise<string | null> {
  let pending = false;
  try {
    pending = await hasPendingMatchUploads();
  } catch {
    pending = false;
  }
  return pending ? signOutUploadMessage(displayName) : null;
}

/**
 * Resolve true to go ahead with sign-out. With no pending upload it
 * resolves true at once (no dialog); otherwise it asks, and resolves with
 * the athlete's answer.
 */
export async function confirmSignOutWithPendingUploads(
  displayName: string | null | undefined,
): Promise<boolean> {
  const message = await pendingUploadSignOutMessage(displayName);
  if (!message) return true;
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      SIGN_OUT_UPLOAD_TITLE,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Sign out anyway", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
