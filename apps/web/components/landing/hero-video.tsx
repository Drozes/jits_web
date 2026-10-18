"use client";

import { useRef } from "react";
import styles from "./landing-hero.module.css";
import { useHeroVideoPlayback } from "./use-hero-video-playback";

/** Versioned names: a recut gets -v2-, never the same name (P14). */
export const HERO_VIDEO = {
  poster: "/landing/videos/sparring-01-v1-poster.jpg",
  mobile: "/landing/videos/sparring-01-v1-720.mp4",
  wide: "/landing/videos/sparring-01-v1-1080.mp4",
} as const;

/**
 * The greyscale sparring b-roll (section 8). No autoplay attribute: play()
 * runs after mount only when motion is allowed and the visitor has not asked
 * to save data, so a reduced-motion visitor downloads no video (P12). It
 * pauses while the tab is hidden or the hero is off screen (P25). If play()
 * is refused, the poster stays.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useHeroVideoPlayback(ref);

  return (
    <video
      ref={ref}
      data-testid="hero-video"
      aria-hidden="true"
      muted
      loop
      playsInline
      preload="none"
      poster={HERO_VIDEO.poster}
      disablePictureInPicture
      disableRemotePlayback
      className={styles.video}
    >
      {/* Light file first: a browser that ignores media on <source> plays it (P15). */}
      <source media="(max-width: 1023px)" src={HERO_VIDEO.mobile} type="video/mp4" />
      <source src={HERO_VIDEO.wide} type="video/mp4" />
    </video>
  );
}
