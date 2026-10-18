import type { CSSProperties } from "react";
import type { LockupArt, LockupPath } from "./lockups/types";

/** One verbatim lockup path; every hook is a data attribute (P20). */
export function LockupPathEl({ path }: { path: LockupPath }) {
  return <path data-part={path.part} data-lk={path.lk} fill={path.fill} fillRule={path.fillRule} d={path.d} />;
}

interface LockupSvgProps {
  art: LockupArt;
  /** The tier this drawing is; the set's data-tier picks which one shows. */
  tier: string;
}

/** A decorative hero lockup drawing (the hidden h1 carries the words). */
export function LockupSvg({ art, tier }: LockupSvgProps) {
  return (
    <svg
      viewBox={art.viewBox}
      aria-hidden="true"
      focusable="false"
      data-tier-art={tier}
      style={{ "--x": art.x } as CSSProperties}
    >
      {art.paths?.map((p, i) => <LockupPathEl key={i} path={p} />)}
      {art.groups.map((g) => (
        <g key={g.lk} data-lk={g.lk} fill={g.fill}>
          {g.innerTransform ? (
            <g transform={g.innerTransform}>
              {g.paths.map((p, i) => <LockupPathEl key={i} path={p} />)}
            </g>
          ) : (
            g.paths.map((p, i) => <LockupPathEl key={i} path={p} />)
          )}
        </g>
      ))}
    </svg>
  );
}
