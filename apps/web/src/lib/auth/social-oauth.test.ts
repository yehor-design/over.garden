import { describe, expect, it } from "vitest";

import { oauthCallbackPath, oauthErrorCodeForRedirect } from "./social-oauth";

describe("social OAuth client helpers", () => {
  it("keeps callback URLs path-scoped and strips stale OAuth errors", () => {
    expect(
      oauthCallbackPath({
        pathname: "/garden",
        search: "?source=homepage&error=account_not_linked",
      }),
    ).toBe("/garden?source=homepage");

    expect(
      oauthCallbackPath({
        pathname: "https://evil.example/garden",
        search: "?error=invalid_code",
      }),
    ).toBe("/garden");
  });

  it("reduces callback failures to a bounded recovery code", () => {
    expect(oauthErrorCodeForRedirect("account-not-linked")).toBe(
      "account_not_linked",
    );
    expect(oauthErrorCodeForRedirect("unknown private provider detail")).toBe(
      "oauth_error",
    );
    expect(oauthErrorCodeForRedirect(undefined)).toBeNull();
    expect(oauthErrorCodeForRedirect(["email_doesn't_match"])).toBe(
      "email_doesnt_match",
    );
  });
});
