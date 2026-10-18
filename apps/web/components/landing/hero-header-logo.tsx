import { HORIZONTAL_H1 } from "./lockups/horizontal-h1";
import { LockupPathEl } from "./lockup-svg";
import styles from "./landing-hero.module.css";

/**
 * Thomas's horizontal crown lockup H1 at exactly 137 x 31 CSS px, its pixel
 * grid (O2). Not a link: the page is "/" itself.
 */
export function HeroHeaderLogo() {
  return (
    <div className={styles.header} data-testid="hero-header-logo">
      <svg
        role="img"
        aria-label="ELO RATED"
        viewBox={HORIZONTAL_H1.viewBox}
        width={137}
        height={31}
        focusable="false"
      >
        {HORIZONTAL_H1.paths?.map((p, i) => <LockupPathEl key={i} path={p} />)}
      </svg>
    </div>
  );
}
