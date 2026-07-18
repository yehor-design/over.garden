import { describe, expect, it } from "vitest";

import {
  ALLOWED_IDENTITY_POLICY_FIXTURES,
  IDENTITY_POLICY_FIXTURE_SET_PROVENANCE,
  REJECTED_IDENTITY_POLICY_FIXTURES,
  type IdentityPolicyFixture,
} from "@/server/identity-policy-fixtures";
import {
  IDENTITY_POLICY_VERSION,
  evaluatePublicIdentity,
  isTrustedGeneratedHandle,
  parsePublicHandleSyntax,
} from "@/server/identity-policy";
import {
  IDENTITY_POLICY_ALLOWLIST,
  IDENTITY_POLICY_DATA_PROVENANCE,
  IDENTITY_POLICY_RULES,
} from "@/server/identity-policy-data";

function fixtureFailure(id: string): never {
  throw new Error(`identity-policy-fixture:${id}`);
}

function findFixture(
  fixtures: readonly IdentityPolicyFixture[],
  id: string,
): IdentityPolicyFixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);

  return fixture ?? fixtureFailure(id);
}

describe("OVE-203 public identity policy", () => {
  describe("curated rejection fixtures", () => {
    for (const fixture of REJECTED_IDENTITY_POLICY_FIXTURES) {
      it(`rejects opaque fixture ${fixture.id}`, () => {
        const result = evaluatePublicIdentity({
          surface: fixture.surface,
          value: fixture.value,
        });

        if (result.ok) {
          fixtureFailure(fixture.id);
        }

        expect(Object.keys(result)).toEqual(["ok"]);
        expect(JSON.stringify(result)).toBe('{"ok":false}');
      });
    }
  });

  describe("reviewed benign fixtures", () => {
    for (const fixture of ALLOWED_IDENTITY_POLICY_FIXTURES) {
      it(`allows opaque fixture ${fixture.id}`, () => {
        const result = evaluatePublicIdentity({
          surface: fixture.surface,
          value: fixture.value,
        });

        if (!result.ok || result.value.length === 0) {
          fixtureFailure(fixture.id);
        }

        expect(Object.keys(result).sort()).toEqual(["ok", "value"]);
      });
    }
  });

  describe("versioned policy data", () => {
    for (const rule of IDENTITY_POLICY_RULES) {
      it(`enforces opaque rule ${rule.id}`, () => {
        for (const [valueIndex, value] of rule.values.entries()) {
          const result = evaluatePublicIdentity({
            surface: "display_name",
            value,
          });

          if (result.ok) {
            fixtureFailure(
              `${rule.id}-${valueIndex.toString().padStart(3, "0")}`,
            );
          }
        }
      });
    }

    it("allows every reviewed full-identity exception", () => {
      for (const [valueIndex, value] of IDENTITY_POLICY_ALLOWLIST.entries()) {
        const result = evaluatePublicIdentity({
          surface: "display_name",
          value,
        });

        if (!result.ok) {
          fixtureFailure(`L${valueIndex.toString().padStart(3, "0")}`);
        }
      }
    });
  });

  it("separates syntax-only reads from current write moderation", () => {
    const parsed = parsePublicHandleSyntax(" @API ");

    expect(parsed).toEqual({
      ok: true,
      handle: "api",
      normalizedHandle: "api",
      mention: "@api",
    });
    expect(evaluatePublicIdentity({ surface: "handle", value: "api" })).toEqual(
      { ok: false },
    );
  });

  it("normalizes valid handle syntax deterministically and idempotently", () => {
    const parsed = parsePublicHandleSyntax(" @Green_Thumb42 ");

    expect(parsed).toEqual({
      ok: true,
      handle: "green_thumb42",
      normalizedHandle: "green_thumb42",
      mention: "@green_thumb42",
    });

    if (!parsed.ok) {
      throw new Error("identity-policy-syntax-invariant");
    }

    expect(parsePublicHandleSyntax(parsed.normalizedHandle)).toEqual(parsed);
  });

  it("keeps syntax failures generic and bounded", () => {
    expect(parsePublicHandleSyntax("@@broken")).toEqual({ ok: false });
    expect(parsePublicHandleSyntax("a".repeat(65))).toEqual({ ok: false });
    expect(parsePublicHandleSyntax("ab")).toEqual({ ok: false });
    expect(parsePublicHandleSyntax("garden-name")).toEqual({ ok: false });
  });

  it("recognizes only the exact protected generated-handle grammar", () => {
    expect(isTrustedGeneratedHandle("gardener_0123456789abcdef")).toBe(true);
    expect(isTrustedGeneratedHandle("gardener_0123456789abcdef_1")).toBe(true);
    expect(isTrustedGeneratedHandle("gardener_0123456789abcdef_99")).toBe(true);
    expect(isTrustedGeneratedHandle("gardener_0123456789abcdef_0")).toBe(false);
    expect(isTrustedGeneratedHandle("gardener_0123456789abcdef_100")).toBe(
      false,
    );
    expect(isTrustedGeneratedHandle("gardener_0123456789")).toBe(false);
    expect(isTrustedGeneratedHandle("Gardener_0123456789abcdef")).toBe(false);
  });

  it("never lets a custom write claim a protected generated namespace", () => {
    expect(
      evaluatePublicIdentity({
        surface: "handle",
        value: "gardener_0123456789abcdef",
      }),
    ).toEqual({ ok: false });
  });

  it("preserves legitimate emoji graphemes in canonical display names", () => {
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: "  Сімейний\tсад 👩‍🌾  ",
      }),
    ).toEqual({ ok: true, value: "Сімейний сад 👩‍🌾" });
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: "Родина 👨‍👩‍👧‍👦",
      }),
    ).toEqual({ ok: true, value: "Родина 👨‍👩‍👧‍👦" });
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: "Rose ❤️",
      }),
    ).toEqual({ ok: true, value: "Rose ❤️" });
  });

  it("strips non-emoji hidden formatting but rejects bidi controls", () => {
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: "Green\u200bGarden",
      }),
    ).toEqual({ ok: true, value: "GreenGarden" });
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: "Garden\u2066name\u2069",
      }),
    ).toEqual({ ok: false });
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: "\u200b\u200d\ufe0f",
      }),
    ).toEqual({ ok: false });
  });

  it("bounds pathological Unicode input without throwing or leaking it", () => {
    const overRawLimit = `A${"\u0301".repeat(256)}`;
    const overCanonicalLimit = "A".repeat(81);

    expect(() =>
      evaluatePublicIdentity({
        surface: "display_name",
        value: overRawLimit,
      }),
    ).not.toThrow();
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: overRawLimit,
      }),
    ).toEqual({ ok: false });
    expect(
      evaluatePublicIdentity({
        surface: "display_name",
        value: overCanonicalLimit,
      }),
    ).toEqual({ ok: false });
  });

  it("is deterministic for every opaque fixture", () => {
    for (const fixture of [
      ...REJECTED_IDENTITY_POLICY_FIXTURES,
      ...ALLOWED_IDENTITY_POLICY_FIXTURES,
    ]) {
      const first = JSON.stringify(
        evaluatePublicIdentity({
          surface: fixture.surface,
          value: fixture.value,
        }),
      );
      const second = JSON.stringify(
        evaluatePublicIdentity({
          surface: fixture.surface,
          value: fixture.value,
        }),
      );

      if (first !== second) {
        fixtureFailure(fixture.id);
      }
    }
  });

  it("keeps normalization bounded and deterministic across a generated corpus", () => {
    const alphabet = [
      "a",
      "Z",
      "0",
      "_",
      "-",
      ".",
      " ",
      "Б",
      "і",
      "я",
      "\u0301",
      "\u200b",
      "\u202e",
      "👩‍🌾",
    ] as const;
    let state = 0x203203;

    for (let caseIndex = 0; caseIndex < 256; caseIndex += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      const length = state % 72;
      let candidate = "";

      for (let index = 0; index < length; index += 1) {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        candidate += alphabet[state % alphabet.length];
      }

      try {
        const firstDisplay = evaluatePublicIdentity({
          surface: "display_name",
          value: candidate,
        });
        const secondDisplay = evaluatePublicIdentity({
          surface: "display_name",
          value: candidate,
        });
        const firstHandle = parsePublicHandleSyntax(candidate);
        const secondHandle = parsePublicHandleSyntax(candidate);

        if (
          JSON.stringify(firstDisplay) !== JSON.stringify(secondDisplay) ||
          JSON.stringify(firstHandle) !== JSON.stringify(secondHandle) ||
          (firstDisplay.ok
            ? Object.keys(firstDisplay).sort().join(",") !== "ok,value"
            : Object.keys(firstDisplay).join(",") !== "ok") ||
          (firstHandle.ok
            ? Object.keys(firstHandle).sort().join(",") !==
              "handle,mention,normalizedHandle,ok"
            : Object.keys(firstHandle).join(",") !== "ok")
        ) {
          fixtureFailure(`P${caseIndex.toString().padStart(3, "0")}`);
        }
      } catch {
        fixtureFailure(`P${caseIndex.toString().padStart(3, "0")}`);
      }
    }
  });

  it("never returns diagnostic or candidate fields on rejection", () => {
    const fixture = findFixture(REJECTED_IDENTITY_POLICY_FIXTURES, "R001");
    const result = evaluatePublicIdentity({
      surface: fixture.surface,
      value: fixture.value,
    });

    expect(result).toEqual({ ok: false });
    expect("reason" in result).toBe(false);
    expect("category" in result).toBe(false);
    expect("match" in result).toBe(false);
    expect("raw" in result).toBe(false);
    expect("normalized" in result).toBe(false);
  });

  it("publishes a stable versioned provenance contract", () => {
    expect(IDENTITY_POLICY_VERSION).toBe("ove203-identity-v1");
    expect(IDENTITY_POLICY_DATA_PROVENANCE).toMatchObject({
      schema: "ove203.identity-policy-data-provenance.v1",
      policyVersion: IDENTITY_POLICY_VERSION,
      locales: ["uk", "bg", "ru"],
      origin: "original_overgarden_high_confidence_curation",
      thirdPartyWordlistsCopied: false,
    });
    expect(new Set(IDENTITY_POLICY_RULES.map((rule) => rule.id)).size).toBe(
      IDENTITY_POLICY_RULES.length,
    );
    expect(IDENTITY_POLICY_FIXTURE_SET_PROVENANCE).toMatchObject({
      schema: "ove203.identity-policy-fixture-set.v1",
      fixtureSetVersion: "ove203-identity-fixtures-v1",
      policyVersion: IDENTITY_POLICY_VERSION,
      origin: "original_overgarden_regression_curation",
      thirdPartyFixtureSetsCopied: false,
      diagnosticContract: "opaque_fixture_identifiers_only",
    });
  });
});
