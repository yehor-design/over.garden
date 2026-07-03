import { expect } from "vitest";

// Shared privacy "poison" toolkit for the OVE-40 invariant sweep.
//
// The idea: build one realistic user journey, then deliberately seed every
// private/operator-only field with a unique, recognizable poison value. Public,
// search, analytics, and operator outputs are then scanned to prove the poison
// never escapes. The poison values double as drift detectors: if a future change
// starts spreading a raw row into a public payload, the unique tokens surface it.

export const PRECISE_COORDINATES = "49.842957,24.031111";

export const POISON = {
  preciseCoordinates: PRECISE_COORDINATES,
  streetAddress: "POISON-ADDRESS Sadova St 12 apt 4, Lviv 79000",
  exifGps: "POISON-EXIF GPSLatitude=49.842957;GPSLongitude=24.031111",
  quarantineKey: "quarantine/POISON-owner/original-DSC_0001.heic",
  originalObjectKey: "original/POISON-owner/DSC_0001.heic",
  ownerUserId: "11111111-1111-4000-8000-POISONowner01",
  sessionId: "session-POISON-deadbeef",
  clientMutationId: "client-mutation-POISON-deadbeef",
  email: "secret.gardener+POISON@example.com",
  ipAddress: "203.0.113.77",
  userAgent: "Mozilla/5.0 (POISON-SecretDevice)",
  betterAuthSecret: "better-auth-secret-POISON-deadbeef",
  googleClientId: "google-client-id-POISON.apps.googleusercontent.com",
  googleClientSecret: "google-client-secret-POISON-deadbeef",
  facebookClientId: "facebook-client-id-POISON",
  facebookClientSecret: "facebook-client-secret-POISON-deadbeef",
  resendApiKey: "resend-api-key-POISON-deadbeef",
  r2AccessKeyId: "r2-access-key-POISON-deadbeef",
  r2SecretAccessKey: "r2-secret-access-POISON-deadbeef",
  databaseUrl: "postgresql://dbuser:POISONpass@db.example.internal:5432/over",
  curatorUserId: "22222222-2222-4000-8000-POISONcurator",
  meilisearchApiKey: "meili-master-key-POISON-deadbeef",
  matchingServiceToken: "matching-service-token-POISON-deadbeef",
} as const;

export const ALL_POISON_VALUES: readonly string[] = Object.freeze(
  Object.values(POISON),
);

// Field-name fragments that must never appear as keys in a public or operator
// document payload. Operator surfaces may legitimately expose `requesterUserId`,
// so the owner/creator/handler fragments are scoped to those exact prefixes.
export const FORBIDDEN_KEY_FRAGMENTS: readonly string[] = [
  "owneruserid",
  "createdbyuserid",
  "handledbyuserid",
  "clientmutationid",
  "quarantine",
  "email",
  "ipaddress",
  "useragent",
  "sessionid",
  "coordinate",
  "latitude",
  "longitude",
  "geohash",
  "exif",
  "password",
  "secret",
  "apikey",
];

export function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
  } else if (value instanceof Date) {
    acc.push(value.toISOString());
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      collectStrings(child, acc);
    }
  }

  return acc;
}

export function collectKeys(
  value: unknown,
  acc: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      acc.add(key);
      collectKeys(child, acc);
    }
  }

  return acc;
}

// Join all string *values* (not keys) so a value scan cannot be fooled by a
// field that merely happens to be named like a forbidden value.
function toValueHaystack(value: unknown): string {
  return typeof value === "string"
    ? value
    : collectStrings(value).join("\u0000");
}

export function expectNoForbiddenValues(
  label: string,
  value: unknown,
  values: readonly string[] = ALL_POISON_VALUES,
): void {
  const haystack = toValueHaystack(value);
  const leaked = values.filter((needle) => haystack.includes(needle));
  expect(leaked, `${label} leaked forbidden private values`).toEqual([]);
}

export function expectNoPoisonSentinels(label: string, value: unknown): void {
  const haystack = toValueHaystack(value);
  const matches = haystack.match(/POISON[\w-]*/g) ?? [];
  expect(matches, `${label} leaked a poison sentinel`).toEqual([]);
}

export function expectNoForbiddenKeys(label: string, value: unknown): void {
  const offenders = [...collectKeys(value)].filter((key) => {
    const normalized = key.toLowerCase();
    return FORBIDDEN_KEY_FRAGMENTS.some((fragment) =>
      normalized.includes(fragment),
    );
  });
  expect(offenders, `${label} exposed forbidden private field keys`).toEqual(
    [],
  );
}

// Convenience: assert a payload is clean by values, keys, and sentinels at once.
export function expectPublicPayloadIsClean(
  label: string,
  value: unknown,
): void {
  expectNoForbiddenValues(label, value);
  expectNoForbiddenKeys(label, value);
  expectNoPoisonSentinels(label, value);
}
