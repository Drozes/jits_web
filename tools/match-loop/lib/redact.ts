/**
 * Secret redaction. Every byte the harness writes (console, trace JSONL,
 * result.json, idb command logs) goes through `redact()`. The seed password is
 * registered the moment it is loaded, so nothing downstream can leak it even
 * by accident (an idb `ui text` argument, an error message echoing a request).
 */
const secrets = new Set<string>();

export const REDACTED = "<redacted>";

export function registerSecret(value: string | undefined | null): void {
  if (value && value.length >= 4) secrets.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const s of secrets) {
    if (out.includes(s)) out = out.split(s).join(REDACTED);
  }
  return out;
}

/** JSON.stringify then redact. For trace lines and result files. */
export function redactJson(value: unknown, space?: number): string {
  return redact(JSON.stringify(value, jsonReplacer, space));
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Set) return [...value];
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}
