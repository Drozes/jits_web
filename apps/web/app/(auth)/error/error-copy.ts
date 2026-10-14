const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Access was denied. Please try signing in again.",
  server_error: "Something went wrong on our end. Please try again in a moment.",
  temporarily_unavailable: "The service is temporarily unavailable. Please try again shortly.",
  validation_failed: "There was a problem with your request. Please try again.",
};

const DEFAULT_MESSAGE = "Something unexpected happened. Please try signing in again.";

/** Locked web app: no sign-in on the web, so no "signing in" copy (spec E2). */
const LOCKED_MESSAGES: Record<string, string> = {
  ...ERROR_MESSAGES,
  access_denied: "Access was denied. Please try again.",
};

const LOCKED_DEFAULT_MESSAGE = "Something unexpected happened. Please try again.";

export interface ErrorPageCopy {
  message: string;
  backHref: string;
  backLabel: string;
}

/** /error copy. While the web app is locked, /login is blocked, so the button goes home. */
export function errorPageCopy(webAppEnabled: boolean, code?: string): ErrorPageCopy {
  const messages = webAppEnabled ? ERROR_MESSAGES : LOCKED_MESSAGES;
  const fallback = webAppEnabled ? DEFAULT_MESSAGE : LOCKED_DEFAULT_MESSAGE;
  const message = (code && messages[code]) || fallback;
  return webAppEnabled
    ? { message, backHref: "/login", backLabel: "Back to sign in" }
    : { message, backHref: "/", backLabel: "Back to ELO RATED" };
}
