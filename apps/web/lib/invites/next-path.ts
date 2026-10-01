const INVITE_NEXT_RE = /^\/c\/([A-Za-z0-9_-]{22})$/;

/** The invite token carried by a `?next=/c/<token>`, else null. */
export function inviteTokenFromNextPath(next: string | null | undefined): string | null {
  return next ? (INVITE_NEXT_RE.exec(next)?.[1] ?? null) : null;
}
