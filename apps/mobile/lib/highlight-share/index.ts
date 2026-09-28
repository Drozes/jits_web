// STUB (replaced by feat/hl-p2-core at merge)
// Minimal typed stand-in for the F5 share module's public surface (jr_be spec
// 014 section 16.6.1) so feat/hl-p2-viewer typechecks. Signatures are copied
// verbatim from the spec; the hook does nothing. Delete this file when
// merging feat/hl-p2-core (its real index.ts replaces it).
import type { HighlightCaptionContext, HighlightShareSourceTag } from "@jits/shared/api/highlight-share";

export interface ShareCapabilities {
  reels: boolean; shareSheet: boolean; saveToPhotos: boolean; clipboard: boolean; facebookAppIdConfigured: boolean;
}
export type SharePath = "reels" | "share_sheet";
export type ShareStage = "idle" | "preparing" | "downloading" | "ready" | "handing_off" | "returned" | "done" | "failed";
export interface ShareError { kind: "disabled" | "download" | "reels" | "share_sheet" | "save" | "permission"; message: string; canFallBack: boolean }
export interface UseHighlightShareResult {
  capabilities: ShareCapabilities | null;
  primaryPath: SharePath | null;
  stage: ShareStage; progress: number | null; error: ShareError | null;
  caption: string; collabTip: string;
  start(): void;
  handoff(path?: SharePath): Promise<void>;
  saveToPhotos(): Promise<void>;
  copyCaption(): Promise<boolean>;
  reset(): void;
}

export async function getShareCapabilities(): Promise<ShareCapabilities> {
  return { reels: false, shareSheet: false, saveToPhotos: false, clipboard: false, facebookAppIdConfigured: false };
}
export async function sweepShareCache(): Promise<void> {}
export async function clearShareCache(): Promise<void> {}

export function useHighlightShare(_params: {
  highlightId: string; shareEnabled: boolean; durationS: number | null;
  captionContext: HighlightCaptionContext | null; source: HighlightShareSourceTag;
}): UseHighlightShareResult {
  return {
    capabilities: null, primaryPath: null, stage: "idle", progress: null, error: null, caption: "", collabTip: "",
    start: () => undefined, handoff: async () => undefined, saveToPhotos: async () => undefined,
    copyCaption: async () => false, reset: () => undefined,
  };
}
