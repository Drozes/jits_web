// Local auth feature flags.
//
// APPLE_SIGN_IN_ENABLED: the "Sign in with Apple" button + flow are fully wired
// (auth-context, login, signup), but the Supabase Apple provider and the Apple
// Developer "Sign in with Apple" capability are not configured yet (jits-rag).
// Keep this false so the button stays hidden; flip to true once the provider is
// live and a new build is cut.
export const APPLE_SIGN_IN_ENABLED = false;
