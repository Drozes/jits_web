/**
 * Types for the explicit deep import of tus-js-client's BROWSER build.
 *
 * WHY THE DEEP IMPORT. `tus-js-client`'s `main` is the NODE build
 * (`lib.es5/node/index.js`), which pulls in `fs`, `stream` and
 * `proper-lockfile`. The package redirects to the browser build through the
 * `browser` field, which Metro honours but Jest (>= 28, where the `browser`
 * resolver option was removed) does not. Importing the browser build by path
 * makes Metro and Jest resolve the SAME file, so what the tests exercise is
 * what ships. The browser build is safe to load under React Native: its only
 * environment probe at module scope is `'localStorage' in window` inside a
 * try/catch, which simply reports `canStoreURLs === false` on RN (we supply
 * our own AsyncStorage-backed `urlStorage` instead).
 */
declare module "tus-js-client/lib.es5/browser/index.js" {
  export { Upload, DetailedError, isSupported, canStoreURLs, defaultOptions } from "tus-js-client";
}
