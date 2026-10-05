import * as React from "react";
import { getActiveMatchUploads, getMatchUpload, subscribeMatchUpload, useActiveMatchUploads } from "./match-upload-store";
import { deriveUploadStrip, STRIP_UPLOADED_MS, type UploadStripModel } from "./upload-strip";
import { useStripSuppressions } from "./upload-strip-visibility";

/**
 * The match whose outstanding upload just landed, for 4 s ("Match video
 * uploaded", deck section 3), else null.
 */
export function useUploadedFlash(): string | null {
  const [flash, setFlash] = React.useState<string | null>(null);
  React.useEffect(() => {
    let outstanding = new Set(getActiveMatchUploads().map((e) => e.matchId));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeMatchUpload(() => {
      for (const id of outstanding) {
        if (getMatchUpload(id)?.status === "uploaded") {
          setFlash(id);
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => setFlash(null), STRIP_UPLOADED_MS);
        }
      }
      outstanding = new Set(getActiveMatchUploads().map((e) => e.matchId));
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return flash;
}

/** The strip's model from the store and the suppressions (null: hidden). */
export function useUploadStripModel(): UploadStripModel | null {
  const jobs = useActiveMatchUploads();
  const flash = useUploadedFlash();
  const suppressions = useStripSuppressions();
  return React.useMemo(() => deriveUploadStrip(jobs, flash, suppressions), [jobs, flash, suppressions]);
}
