import { StoreBadges } from "@/components/app-links/store-badges";
import { HeroHeaderLogo } from "./hero-header-logo";
import { HeroLockup } from "./hero-lockup";
import { HeroTicker } from "./hero-ticker";
import { HeroVideo } from "./hero-video";
import styles from "./landing-hero.module.css";
import { LockupTierSync } from "./lockup-tier-sync";

const CORNERS = [styles.tl, styles.tr, styles.bl, styles.br];

/**
 * Thomas's teaser v2 hero (specs/web-landing/addendum-teaser-v2.md): the
 * dimmed sparring video, the crown lockups with a one-time CSS intro, the
 * red hero line and the store badges, static viewfinder corners and the
 * sample ticker. Server-rendered and static; the client parts only pick the
 * lockup drawing, play the video and run the ticker.
 */
export function LandingHero() {
  return (
    <section data-testid="landing-hero" data-hero-root="" data-intro="playing" className={styles.hero}>
      <HeroVideo />
      <div aria-hidden="true" className={styles.overlay} />
      <HeroHeaderLogo />
      <h1 className={styles.srOnly}>We are ELO RATED. Are you?</h1>
      <div className={styles.column}>
        <HeroLockup />
        <div className={styles.badges} data-testid="hero-badges">
          <StoreBadges size="sm" align="center" />
        </div>
      </div>
      {CORNERS.map((c, i) => (
        <span key={i} aria-hidden="true" data-testid="hero-corner" className={`${styles.corner} ${c}`} />
      ))}
      <HeroTicker />
      <LockupTierSync />
    </section>
  );
}
