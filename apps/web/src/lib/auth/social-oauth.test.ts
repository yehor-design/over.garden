import { describe, expect, it, vi } from "vitest";

import {
  getSafeOAuthAuthorizationUrl,
  navigateToOAuthAuthorization,
  oauthCallbackPath,
  oauthErrorCodeForRedirect,
} from "./social-oauth";

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

  it("admits only HTTPS authorization hosts owned by the selected provider", () => {
    expect(
      getSafeOAuthAuthorizationUrl(
        "google",
        "https://accounts.google.com/o/oauth2/v2/auth?state=opaque",
      ),
    ).toContain("https://accounts.google.com/");
    expect(
      getSafeOAuthAuthorizationUrl(
        "google",
        "https://untrusted-idp.example/oauth",
      ),
    ).toBeNull();
    expect(
      getSafeOAuthAuthorizationUrl("google", "http://accounts.google.com/"),
    ).toBeNull();
    expect(getSafeOAuthAuthorizationUrl("google", "not-a-url")).toBeNull();
  });

  it("performs exactly one supplied top-level navigation only for an admitted URL", () => {
    const navigate = vi.fn();

    expect(
      navigateToOAuthAuthorization(
        "google",
        "https://accounts.google.com/o/oauth2/v2/auth",
        navigate,
      ),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledOnce();

    expect(
      navigateToOAuthAuthorization("google", "https://example.test/", navigate),
    ).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
  });
});
