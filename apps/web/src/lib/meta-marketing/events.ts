export type EnvLike = Record<string, string | undefined>;

export const META_MARKETING_MEASUREMENT_ENABLED_ENV =
  "NEXT_PUBLIC_META_MARKETING_MEASUREMENT_ENABLED";
export const META_PIXEL_ID_ENV = "NEXT_PUBLIC_META_PIXEL_ID";
export const META_CONVERSIONS_API_ACCESS_TOKEN_ENV =
  "META_CONVERSIONS_API_ACCESS_TOKEN";
export const META_CONVERSIONS_API_TEST_EVENT_CODE_ENV =
  "META_CONVERSIONS_API_TEST_EVENT_CODE";
export const META_CONVERSIONS_API_GRAPH_VERSION_ENV =
  "META_CONVERSIONS_API_GRAPH_VERSION";

export const META_MARKETING_CONSENT_STORAGE_KEY =
  "overgarden:meta-marketing-consent";
export const META_MARKETING_CONSENT_EVENT =
  "overgarden:meta-marketing-consent-change";

export const META_MARKETING_EVENT_NAMES = [
  "landing_page_view",
  "signup_started",
  "account_created",
  "first_entry_saved",
  "return_visit",
  "invite_requested",
] as const;

export type MetaMarketingEventName =
  (typeof META_MARKETING_EVENT_NAMES)[number];

export type MetaMarketingConsent = "accepted" | "declined" | "undecided";

export interface MetaMarketingPublicConfig {
  enabled: boolean;
  pixelId: string | null;
}

export function isMetaMarketingEventName(
  value: unknown,
): value is MetaMarketingEventName {
  return (
    typeof value === "string" &&
    META_MARKETING_EVENT_NAMES.includes(value as MetaMarketingEventName)
  );
}

export function isAffirmativeMetaMarketingFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function configuredMetaMarketingEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return null;

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("change_me") ||
    normalized.includes("placeholder") ||
    normalized.includes("replace_me") ||
    normalized.includes("todo") ||
    normalized.includes("...")
  ) {
    return null;
  }

  return trimmed;
}

export function resolveMetaMarketingPublicConfig(
  env: EnvLike = process.env,
): MetaMarketingPublicConfig {
  const enabled = isAffirmativeMetaMarketingFlag(
    env[META_MARKETING_MEASUREMENT_ENABLED_ENV],
  );
  const pixelId = configuredMetaMarketingEnvValue(env[META_PIXEL_ID_ENV]);

  return {
    enabled: enabled && Boolean(pixelId),
    pixelId,
  };
}

export function normalizeMetaMarketingConsent(
  value: string | null | undefined,
): MetaMarketingConsent {
  return value === "accepted" || value === "declined" ? value : "undecided";
}
