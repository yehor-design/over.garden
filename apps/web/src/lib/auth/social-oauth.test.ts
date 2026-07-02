import { describe, expect, it } from "vitest";

import { oauthCallbackPath, oauthErrorRecoveryMessage } from "./social-oauth";

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

  it("explains duplicate email account behavior without creating a second garden", () => {
    expect(oauthErrorRecoveryMessage("account_not_linked")).toContain(
      "existing OverGarden account",
    );
    expect(oauthErrorRecoveryMessage("account_not_linked")).toContain(
      "link the sign-in method",
    );
    expect(oauthErrorRecoveryMessage(["email_doesn't_match"])).toContain(
      "different email",
    );
    expect(oauthErrorRecoveryMessage("oauth_provider_not_found")).toContain(
      "not configured",
    );
  });
});
