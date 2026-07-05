import "server-only";

import {
  META_CONVERSIONS_API_ACCESS_TOKEN_ENV,
  META_CONVERSIONS_API_GRAPH_VERSION_ENV,
  META_CONVERSIONS_API_TEST_EVENT_CODE_ENV,
  META_MARKETING_MEASUREMENT_ENABLED_ENV,
  META_PIXEL_ID_ENV,
  configuredMetaMarketingEnvValue,
  isAffirmativeMetaMarketingFlag,
  isMetaMarketingEventName,
  type EnvLike,
  type MetaMarketingEventName,
} from "@/lib/meta-marketing/events";

export const META_CONVERSIONS_API_DEFAULT_GRAPH_VERSION = "v23.0";

const SAFE_EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{8,120}$/;
const SAFE_GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;
const ALLOWED_REQUEST_KEYS = new Set([
  "eventName",
  "eventId",
  "marketingConsent",
  "browserPixelSent",
]);
const FORBIDDEN_META_MARKETING_FRAGMENTS = [
  "address",
  "admin",
  "auth",
  "body",
  "callback",
  "catalog",
  "comment",
  "coordinate",
  "cookie",
  "derivative",
  "email",
  "exif",
  "file",
  "fbc",
  "fbp",
  "ip",
  "journal",
  "key",
  "lat",
  "lon",
  "location",
  "media",
  "metadata",
  "name",
  "phone",
  "plant",
  "provider",
  "query",
  "quarantine",
  "raw",
  "refer",
  "route",
  "secret",
  "space",
  "text",
  "title",
  "token",
  "upload",
  "url",
  "user",
] as const;

export interface MetaConversionsRequest {
  eventName: MetaMarketingEventName;
  eventId: string;
  marketingConsent: "accepted";
  browserPixelSent: boolean;
}

export interface MetaConversionsApiPayload {
  data: [
    {
      event_name: MetaMarketingEventName;
      event_time: number;
      event_id: string;
      action_source: "website";
      user_data: Record<string, never>;
      custom_data: {
        overgarden_event_class: MetaMarketingEventName;
        overgarden_surface_class: "public_marketing" | "garden_activation";
        browser_pixel_sent: boolean;
      };
    },
  ];
  test_event_code?: string;
}

export interface MetaConversionsApiResult {
  sent: boolean;
  reason:
    | "sent"
    | "consent_required"
    | "disabled"
    | "not_configured"
    | "invalid_payload"
    | "meta_rejected"
    | "network_error";
}

interface MetaConversionsApiConfig {
  enabled: boolean;
  pixelId: string | null;
  accessToken: string | null;
  testEventCode: string | null;
  graphVersion: string;
}

export function normalizeMetaConversionsRequestBody(
  body: unknown,
): MetaConversionsRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  for (const key of Object.keys(body)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) return null;
  }

  const candidate = body as Record<string, unknown>;
  const eventName = candidate.eventName;
  const eventId = candidate.eventId;
  const marketingConsent = candidate.marketingConsent;
  const browserPixelSent = candidate.browserPixelSent;

  if (!isMetaMarketingEventName(eventName)) return null;
  if (typeof eventId !== "string" || !SAFE_EVENT_ID_PATTERN.test(eventId)) {
    return null;
  }
  if (marketingConsent !== "accepted") return null;
  if (
    browserPixelSent !== undefined &&
    typeof browserPixelSent !== "boolean"
  ) {
    return null;
  }

  return {
    eventName,
    eventId,
    marketingConsent,
    browserPixelSent: browserPixelSent === true,
  };
}

export async function sendMetaConversionsApiEvent(
  request: MetaConversionsRequest,
  options: {
    env?: EnvLike;
    fetcher?: typeof fetch;
    now?: () => Date;
  } = {},
): Promise<MetaConversionsApiResult> {
  if (request.marketingConsent !== "accepted") {
    return { sent: false, reason: "consent_required" };
  }

  const env = options.env ?? process.env;
  const config = resolveMetaConversionsApiConfig(env);
  if (!config.enabled) return { sent: false, reason: "disabled" };
  if (!config.pixelId || !config.accessToken) {
    return { sent: false, reason: "not_configured" };
  }

  const payload = buildMetaConversionsApiPayload(request, {
    testEventCode: config.testEventCode,
    now: options.now,
  });
  const fetcher = options.fetcher ?? fetch;
  const endpoint = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${config.pixelId}/events`,
  );
  endpoint.searchParams.set("access_token", config.accessToken);

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) return { sent: false, reason: "meta_rejected" };
    return { sent: true, reason: "sent" };
  } catch {
    return { sent: false, reason: "network_error" };
  }
}

export function buildMetaConversionsApiPayload(
  request: MetaConversionsRequest,
  options: {
    testEventCode?: string | null;
    now?: () => Date;
  } = {},
): MetaConversionsApiPayload {
  const surfaceClass = request.browserPixelSent
    ? "public_marketing"
    : "garden_activation";
  const payload: MetaConversionsApiPayload = {
    data: [
      {
        event_name: request.eventName,
        event_time: Math.floor(
          (options.now?.() ?? new Date()).getTime() / 1000,
        ),
        event_id: request.eventId,
        action_source: "website",
        user_data: {},
        custom_data: {
          overgarden_event_class: request.eventName,
          overgarden_surface_class: surfaceClass,
          browser_pixel_sent: request.browserPixelSent,
        },
      },
    ],
  };
  const testEventCode = configuredMetaMarketingEnvValue(
    options.testEventCode ?? undefined,
  );

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  assertSafeMetaMarketingEvidence(payload.data[0].custom_data);
  return payload;
}

export function resolveMetaConversionsApiConfig(
  env: EnvLike = process.env,
): MetaConversionsApiConfig {
  const graphVersion =
    configuredMetaMarketingEnvValue(
      env[META_CONVERSIONS_API_GRAPH_VERSION_ENV],
    ) ?? META_CONVERSIONS_API_DEFAULT_GRAPH_VERSION;

  return {
    enabled: isAffirmativeMetaMarketingFlag(
      env[META_MARKETING_MEASUREMENT_ENABLED_ENV],
    ),
    pixelId: configuredMetaMarketingEnvValue(env[META_PIXEL_ID_ENV]),
    accessToken: configuredMetaMarketingEnvValue(
      env[META_CONVERSIONS_API_ACCESS_TOKEN_ENV],
    ),
    testEventCode: configuredMetaMarketingEnvValue(
      env[META_CONVERSIONS_API_TEST_EVENT_CODE_ENV],
    ),
    graphVersion: SAFE_GRAPH_VERSION_PATTERN.test(graphVersion)
      ? graphVersion
      : META_CONVERSIONS_API_DEFAULT_GRAPH_VERSION,
  };
}

export function assertSafeMetaMarketingEvidence(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (!serialized) return;

  const normalized = serialized.toLowerCase();
  const forbidden = FORBIDDEN_META_MARKETING_FRAGMENTS.find((fragment) =>
    normalized.includes(fragment),
  );

  if (forbidden) {
    throw new Error(
      `Forbidden Meta marketing measurement evidence fragment: ${forbidden}.`,
    );
  }
}
