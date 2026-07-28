import { describe, expect, it } from "vitest";

import { classifyMediaProviderError } from "@/lib/storage";

describe("media provider absence classification", () => {
  it.each([
    [{ name: "NotFound" }, "not_found"],
    [{ name: "NoSuchKey" }, "not_found"],
    [{ $metadata: { httpStatusCode: 404 } }, "not_found"],
    [{ name: "AccessDenied", $metadata: { httpStatusCode: 403 } }, "indeterminate_auth"],
    [{ name: "SignatureDoesNotMatch" }, "indeterminate_auth"],
    [{ $metadata: { httpStatusCode: 503 } }, "provider_error"],
    [new TypeError("network request failed"), "indeterminate_transport"],
    [new Error("socket ECONNRESET"), "indeterminate_transport"],
    [new Error("unexpected SDK failure"), "provider_error"],
  ] as const)("classifies %j as %s", (error, expected) => {
    expect(classifyMediaProviderError(error)).toBe(expected);
  });
});
