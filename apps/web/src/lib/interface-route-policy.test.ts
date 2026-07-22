import { describe, expect, it } from "vitest";

import {
  buildLocalizedInterfaceTarget,
  getInterfaceLanguageControlPlacement,
  getInterfaceRoutePolicy,
  INTERFACE_UTILITY_CONTROL_PREFIXES,
  sanitizeInterfaceRouteFragment,
  sanitizeInterfaceRouteSearch,
} from "./interface-route-policy";

describe("interface route policy", () => {
  it("classifies localized, canonical unprefixed, and non-UI routes", () => {
    expect(getInterfaceRoutePolicy("/topics/care-checks").mode).toBe(
      "localized-link",
    );
    expect(getInterfaceRoutePolicy("/ru/topics/care-checks").mode).toBe(
      "localized-link",
    );
    expect(getInterfaceRoutePolicy("/garden/profile").mode).toBe(
      "same-path-preference",
    );
    expect(getInterfaceRoutePolicy("/admin").mode).toBe("same-path-preference");
    expect(getInterfaceRoutePolicy("/markets/ukraine").mode).toBe(
      "localized-link",
    );
    expect(getInterfaceRoutePolicy("/api/interface/locale").mode).toBe(
      "non-ui",
    );
    expect(getInterfaceRoutePolicy("/api/interface/context").mode).toBe(
      "non-ui",
    );
    expect(getInterfaceRoutePolicy("/apiary").mode).toBe(
      "same-path-preference",
    );
    expect(getInterfaceRoutePolicy("/bg/api/interface/locale")).toMatchObject({
      id: "generic-prefixed-rendered-not-found",
      mode: "localized-link",
    });
    expect(getInterfaceRoutePolicy("/ru/skeleton")).toMatchObject({
      id: "generic-prefixed-rendered-not-found",
      mode: "localized-link",
    });
  });

  it("builds localized targets without ever prefixing canonical private routes", () => {
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/topics/care-checks",
      }),
    ).toBe("/ru/topics/care-checks");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "bg",
        pathname: "/garden/profile",
      }),
    ).toBeNull();
  });

  it("owns drift-proof language-control placement for every operator prefix", () => {
    for (const prefix of INTERFACE_UTILITY_CONTROL_PREFIXES) {
      expect(getInterfaceLanguageControlPlacement(prefix)).toBe("utility");
      expect(getInterfaceLanguageControlPlacement(`${prefix}/nested`)).toBe(
        "utility",
      );
      expect(getInterfaceLanguageControlPlacement(`/bg${prefix}`)).toBe(
        "utility",
      );
    }
    expect(getInterfaceLanguageControlPlacement("/garden/profile")).toBe(
      "site-shell",
    );
    expect(
      getInterfaceLanguageControlPlacement("/__visual-fixtures/admin"),
    ).toBe("none");
    expect(getInterfaceLanguageControlPlacement("/skeleton")).toBe("none");
    expect(getInterfaceLanguageControlPlacement("/bg/skeleton")).toBe(
      "site-shell",
    );
    expect(
      getInterfaceLanguageControlPlacement("/ru/__visual-fixtures/profile"),
    ).toBe("site-shell");
  });

  it("converges generic prefixed not-found routes while leaving unknown unprefixed routes canonical", () => {
    expect(getInterfaceRoutePolicy("/bg/unknown")).toMatchObject({
      id: "generic-prefixed-rendered-not-found",
      mode: "localized-link",
    });
    expect(getInterfaceRoutePolicy("/unknown").mode).toBe(
      "same-path-preference",
    );
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/unknown",
        search: "?token=opaque",
        fragment: "#details",
      }),
    ).toBe("/ru/unknown#details");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "bg",
        pathname: "/ru/missing/deep-path",
      }),
    ).toBe("/bg/missing/deep-path");
  });

  it("does not carry private-looking generic not-found path state across locales", () => {
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/reset/eyJhbGciOiJIUzI1NiJ9.opaque-signature",
        search: "?token=opaque",
        fragment: "#private-fragment",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/missing/00000000-0000-4000-8000-000000000123",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "uk",
        pathname: "/ru/missing/token%3Dcredential",
      }),
    ).toBe("/");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/unknown/value%2Fprivate",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/unknown/value%5Cprivate",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/unknown/eyJhbGciOiJIUzI1NiJ9.opaque-signature",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "bg",
        pathname: "/ru/missing/opaqueCredential1234567890abcdef",
      }),
    ).toBe("/bg");
  });

  it("keeps legitimate slugs on known public route classes", () => {
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/journal/lemon-new-growth",
      }),
    ).toBe("/ru/journal/lemon-new-growth");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/topics/care-checks",
      }),
    ).toBe("/ru/topics/care-checks");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/@public_handle",
      }),
    ).toBe("/ru/@public_handle");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/journal/babusyn-perets-0000000201",
      }),
    ).toBe("/ru/journal/babusyn-perets-0000000201");
  });

  it("rejects secret-shaped values even inside a known public detail route", () => {
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/journal/eyJhbGciOiJIUzI1NiJ9.opaque-signature",
        search: "?engagement=liked",
        fragment: "#comments",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/topics/00000000-0000-4000-8000-000000000123",
      }),
    ).toBe("/ru");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/blog/token%3Dv1.secret",
      }),
    ).toBe("/ru");
  });

  it("preserves only route-approved bounded query state", () => {
    expect(
      sanitizeInterfaceRouteSearch(
        "/journals",
        "?q=user-authored&region=BG-23&kind=plant&page=2&token=secret&email=user%40example.com",
      ),
    ).toBe("?kind=plant&page=2");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/objects",
        search: new URLSearchParams({
          kind: "plant",
          identity: "species",
          invite: "private-token",
        }),
      }),
    ).toBe("/ru/objects?kind=plant&identity=species");
    expect(
      sanitizeInterfaceRouteSearch(
        "/notifications",
        "?filter=comments&filter=system&unread=1&view=individual&engagement=notification-updated",
      ),
    ).toBe(
      "?filter=comments&unread=1&view=individual&engagement=notification-updated",
    );
    expect(
      sanitizeInterfaceRouteSearch(
        "/journal/garden-log",
        "?from=%2Fjournals%3Fq%3Dprivate-note%26region%3DBG-23%26topic%3Droses%26token%3Dsecret&engagement=liked&authIntent=comment&authControl=reply-a7d8f9c012345678&intent=opaque-token",
      ),
    ).toBe("?from=%2Fjournals&engagement=liked&authIntent=comment");
    expect(
      sanitizeInterfaceRouteSearch(
        "/journal/garden-log",
        "?authIntent=opaque&authControl=TOKEN&engagement=arbitrary",
      ),
    ).toBe("");
    expect(
      sanitizeInterfaceRouteSearch(
        "/objects",
        "?kind=private-kind&identity=private-id&page=01&q=private-note",
      ),
    ).toBe("");
    expect(
      sanitizeInterfaceRouteSearch(
        "/feed",
        "?source=people&kind=animal&cursor=opaque-private-id",
      ),
    ).toBe("?source=people&kind=animal");
    expect(sanitizeInterfaceRouteSearch("/journals", "?page=1000")).toBe(
      "?page=1000",
    );
    expect(sanitizeInterfaceRouteSearch("/journals", "?page=1001")).toBe("");
    expect(
      sanitizeInterfaceRouteSearch(
        "/ru/bookmarks",
        "?kind=journal_entry&page=2",
      ),
    ).toBe("?kind=journal_entry&page=2");
    expect(
      sanitizeInterfaceRouteSearch(
        "/bg/wishlist",
        "?kind=plant_variety&page=3",
      ),
    ).toBe("?kind=plant_variety&page=3");
    expect(
      sanitizeInterfaceRouteSearch("/bg/wishlist", "?kind=journal_entry"),
    ).toBe("");
    expect(
      sanitizeInterfaceRouteSearch(
        "/journals",
        "?catalog=00000000-0000-4000-8000-000000000123&topic=private-note",
      ),
    ).toBe("");
  });

  it("rewrites a sanitized journal-directory return path to the target locale", () => {
    expect(
      buildLocalizedInterfaceTarget({
        locale: "ru",
        pathname: "/bg/journal/garden-log",
        search:
          "?from=%2Fbg%2Fjournals%3Fkind%3Dplant%26season%3Dsummer%26sort%3Doldest%26page%3D2%26q%3Dprivate-note%26region%3DBG-23%26topic%3Droses%26token%3Dsecret&engagement=liked",
      }),
    ).toBe(
      "/ru/journal/garden-log?from=%2Fru%2Fjournals%3Fkind%3Dplant%26season%3Dsummer%26sort%3Doldest%26page%3D2&engagement=liked",
    );

    expect(
      buildLocalizedInterfaceTarget({
        locale: "uk",
        pathname: "/ru/journal/garden-log",
        search:
          "?from=%2Fru%2Fjournals%3Fkind%3Danimal%26page%3D3%26cursor%3Dprivate-id",
      }),
    ).toBe("/journal/garden-log?from=%2Fjournals%3Fkind%3Danimal%26page%3D3");
  });

  it("preserves only bounded public fragments on localized-link routes", () => {
    expect(sanitizeInterfaceRouteFragment("/blog/post", "#sources")).toBe(
      "#sources",
    );
    expect(
      sanitizeInterfaceRouteFragment("/blog/post", "#reset token=value"),
    ).toBe("");
    expect(
      sanitizeInterfaceRouteFragment("/blog/post", "#token%3Dv1.secret"),
    ).toBe("");
    expect(
      sanitizeInterfaceRouteFragment("/blog/post", "#token:v1.secret"),
    ).toBe("");
    expect(
      buildLocalizedInterfaceTarget({
        locale: "bg",
        pathname: "/blog/post",
        fragment: "#section-2",
      }),
    ).toBe("/bg/blog/post#section-2");
  });
});
