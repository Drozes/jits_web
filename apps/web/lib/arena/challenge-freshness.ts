/**
 * The Arena freshness rule, shared with mobile (`@jits/shared/utils`), so both
 * platforms agree at the boundary millisecond. Kept as a re-export so existing
 * web imports stay put.
 */
export { isFreshChallenge } from "@jits/shared/utils";
