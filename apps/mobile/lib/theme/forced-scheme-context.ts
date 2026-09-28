import * as React from "react";

/**
 * A color scheme pinned for a subtree, or null to follow the app theme.
 * Kept in its own module (no NativeWind import) so `use-theme.ts` can read it
 * and suites that mock `use-theme` are unaffected.
 */
export const ForcedSchemeContext = React.createContext<"light" | "dark" | null>(null);
