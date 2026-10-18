import { heroLine } from "./hero-copy";
import { LockupSvg } from "./lockup-svg";
import { BLOCK_B3 } from "./lockups/block-b3";
import { BLOCK_B3_SM } from "./lockups/block-b3-sm";
import { ONELINE_DETAIL } from "./lockups/oneline-detail";
import { ONELINE_FINE } from "./lockups/oneline-fine";
import { ONELINE_SMALL } from "./lockups/oneline-small";
import styles from "./landing-hero.module.css";

/** [min device px, tier]: Thomas's thresholds (section 1.1, P17). */
export const BLOCK_TIERS = [[108, "b3"], [0, "b3sm"]] as const;
export const ONELINE_TIERS = [[175, "detail"], [112, "fine"], [0, "small"]] as const;

function HeroLine() {
  return (
    <p data-lk="soon" className={styles.soon} style={{ color: "var(--accent-cta-text)" }}>
      {heroLine()}
    </p>
  );
}

/**
 * The two lockup sets; CSS shows one by aspect ratio (block below 4:5,
 * one-line from 4:5), and data-tier picks the drawing inside it. The server
 * renders Thomas's defaults; LockupTierSync re-picks on the client.
 */
export function HeroLockup() {
  return (
    <>
      <div className={styles.set} data-lockup-set="block" data-tier="b3" data-frac="1.0000" data-tiers={JSON.stringify(BLOCK_TIERS)}>
        <LockupSvg art={BLOCK_B3} tier="b3" />
        <LockupSvg art={BLOCK_B3_SM} tier="b3sm" />
        <HeroLine />
      </div>
      <div className={styles.set} data-lockup-set="oneline" data-tier="detail" data-frac="0.3477" data-tiers={JSON.stringify(ONELINE_TIERS)}>
        <LockupSvg art={ONELINE_DETAIL} tier="detail" />
        <LockupSvg art={ONELINE_FINE} tier="fine" />
        <LockupSvg art={ONELINE_SMALL} tier="small" />
        <HeroLine />
      </div>
    </>
  );
}
