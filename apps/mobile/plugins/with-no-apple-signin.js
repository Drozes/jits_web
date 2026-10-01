/**
 * Release 2026-10-01: strip the Sign in with Apple entitlement.
 *
 * expo-apple-authentication is auto-applied by Expo's default plugins
 * whenever the package is installed, and it adds
 * com.apple.developer.applesignin unconditionally. The App Store
 * provisioning profile does not have that capability yet (EAS build 24
 * failed on it), and the button is hidden (APPLE_SIGN_IN_ENABLED=false).
 * Remove this plugin, restore ios.usesAppleSignIn and the
 * expo-apple-authentication plugin entry once the capability is enabled on
 * the App ID (jits-22mp).
 */
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withNoAppleSignIn(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["com.apple.developer.applesignin"];
    return cfg;
  });
};
