/**
 * ELO design system primitives, mirroring apps/web/components/ui/elo-system/ 1:1.
 *
 * These primitives wrap React Native View/Text/Pressable and use NativeWind
 * classes that map to the ELO semantic tokens defined in apps/mobile/lib/tokens.ts
 * and apps/mobile/tailwind.config.js.
 *
 * For the web ⇄ mobile utility name mapping see the header of tailwind.config.js.
 */
export { Plate, type PlateVariant } from "./plate";
export { EloTile } from "./elo-tile";
export { Wordmark } from "./wordmark";
export { Avatar32 } from "./avatar-32";
export { LivePill } from "./live-pill";
export { MetaTag } from "./meta-tag";
export { Chip } from "./chip";
export { DataRow } from "./data-row";
export { DeltaNumber } from "./delta-number";
export { OutcomeTag } from "./outcome-tag";
export { ParticipantRow } from "./participant-row";
export { RankRow } from "./rank-row";
