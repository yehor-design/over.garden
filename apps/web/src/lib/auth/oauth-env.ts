import "server-only";

export type EnvLike = Record<string, string | undefined>;

export function configuredEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return null;
  const normalized = trimmed.toLowerCase();
  if (normalized.includes("change_me") || normalized.includes("...")) {
    return null;
  }

  return trimmed;
}
