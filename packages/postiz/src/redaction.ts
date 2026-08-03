const SECRET_KEY_PATTERN =
  /(authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|cookie)/iu;
const POSTIZ_TOKEN_PATTERN = /\bpos_[a-z0-9._~-]+\b/giu;
const BEARER_PATTERN = /\bBearer\s+[a-z0-9._~+/=-]+/giu;
const AUTHORIZATION_VALUE_PATTERN = /(authorization\s*[:=]\s*)[^\s,;]+/giu;

function redactString(value: string, secrets: readonly string[]): string {
  let redacted = value
    .replace(POSTIZ_TOKEN_PATTERN, "[REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(AUTHORIZATION_VALUE_PATTERN, "$1[REDACTED]");

  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

export function redactPostizSecrets(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((child) => redactPostizSecrets(child, secrets));
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, secrets)
    };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactPostizSecrets(child, secrets)
      ])
    );
  }
  return value;
}
