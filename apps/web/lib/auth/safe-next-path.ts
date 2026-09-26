/**
 * Sanitize the `next` redirect target of the auth callback / confirm routes.
 *
 * Only a same-origin path is accepted: it must start with a single "/". A
 * leading "//" or "/\" is protocol-relative to browsers (an open redirect),
 * and a value without the leading slash turns `${origin}${next}` into
 * userinfo (`https://elorated.com@evil.com`). Control characters are refused
 * too, because URL parsing strips tabs and newlines ("/\t/evil.com" becomes
 * "//evil.com"). Anything else falls back to "/".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next[0] !== "/") return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  if (/[\u0000-\u001F\u007F]/.test(next)) return "/";
  return next;
}
