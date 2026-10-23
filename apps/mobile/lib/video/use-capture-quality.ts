/**
 * The capture quality: 720p or 1080p, from the admin flag
 * `match_capture_1080p` (timekeeper mode spec 13.4, owner decision A22,
 * PM17). The owner flips it in Admin > Feature flags without a release; the
 * next recordings use the new value and the video row records which one
 * (`capture_quality`), so before and after can be compared.
 *
 * Fail-closed like `lib/invites/use-invites-enabled.ts`: off, missing (an
 * older backend) or unreadable all mean 720p, today's value. Unlike that hook
 * nothing is cached across matches: each face-off reads the flag once, so a
 * flip reaches the next match.
 */
import * as React from "react";
import type { MatchVideoCaptureQuality } from "@jits/shared/api/match-video-upload";
import { getFeatureFlag } from "@jits/shared/api/location";
import { supabase } from "@/lib/supabase/client";

export const MATCH_CAPTURE_1080P_FLAG = "match_capture_1080p";

/** Flag off or unknown. */
export const DEFAULT_CAPTURE_QUALITY: MatchVideoCaptureQuality = "720p";

/** One read of the flag; never throws. */
export async function readCaptureQuality(): Promise<MatchVideoCaptureQuality> {
  try {
    const res = await getFeatureFlag(supabase, MATCH_CAPTURE_1080P_FLAG);
    return res.ok && res.data ? "1080p" : DEFAULT_CAPTURE_QUALITY;
  } catch {
    return DEFAULT_CAPTURE_QUALITY;
  }
}

/**
 * The viewfinder's `videoQuality`. The flag is read once, the first time
 * `active` is true (the face-off of a viewer who records, before its camera
 * warms on the ready step), and 720p stands in until the answer lands.
 * Frozen from the first render with `locked` (the live step, or a clip in
 * progress): a new quality reconfigures the capture session, so an answer
 * that lands later is dropped and the recording keeps the value it started
 * with. A viewfinder first active while already locked (re-entering a live
 * match after a relaunch) does not read at all: that clip records at 720p, a
 * trade-off recorded on jits-o47s.14 (the row says `720p`).
 */
export function useCaptureQuality(active: boolean, locked: boolean): MatchVideoCaptureQuality {
  const [quality, setQuality] = React.useState<MatchVideoCaptureQuality>(DEFAULT_CAPTURE_QUALITY);
  // Latched in the commit, before any answer can land after it.
  const lockedRef = React.useRef(locked);
  React.useLayoutEffect(() => {
    if (locked) lockedRef.current = true;
  }, [locked]);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const askedRef = React.useRef(false);
  React.useEffect(() => {
    if (!active || askedRef.current) return;
    askedRef.current = true;
    if (lockedRef.current) return;
    void readCaptureQuality().then((next) => {
      if (!mountedRef.current || lockedRef.current || next === DEFAULT_CAPTURE_QUALITY) return;
      setQuality(next);
    });
  }, [active]);

  return quality;
}
