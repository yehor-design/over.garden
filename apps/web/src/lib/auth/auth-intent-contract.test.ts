import { describe, expect, it } from "vitest";

import {
  AUTH_INTENT_ACTIONS,
  AuthIntentContractError,
  buildAuthIntentResumeHref,
  normalizeAuthIntentDraft,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "./auth-intent-contract";

describe("auth intent contract", () => {
  it("accepts every allowlisted mutation with the smallest safe payload", () => {
    const cases = [
      {
        action: "comment",
        returnTo: "/journal/balcony-tomato-check",
        target: { kind: "journal", ref: "balcony-tomato-check" },
        control: "reply-a7d8f9c012345678",
      },
      {
        action: "bookmark",
        returnTo: "/lineage/objects/18700003-0000-4000-8000-000000000001",
        target: {
          kind: "object",
          ref: "18700003-0000-4000-8000-000000000001",
        },
      },
      {
        action: "follow",
        returnTo: "/lineage/objects/18700003-0000-4000-8000-000000000002",
        target: {
          kind: "object",
          ref: "18700003-0000-4000-8000-000000000002",
        },
      },
      {
        action: "claim",
        returnTo: "/garden/lineage/invitations/claim",
      },
      { action: "create_object", returnTo: "/garden" },
      { action: "create_entry", returnTo: "/garden" },
      { action: "save", returnTo: "/garden?tab=drafts" },
      {
        action: "publish",
        returnTo: "/garden/objects/18700003-0000-4000-8000-000000000003",
        target: { kind: "journal", ref: "private-entry-ready-to-publish" },
      },
    ] as const;

    expect(AUTH_INTENT_ACTIONS).toEqual(cases.map((item) => item.action));

    for (const item of cases) {
      expect(normalizeAuthIntentDraft(item)).toEqual(item);
    }
  });

  it("preserves only bounded route state needed to return to the same view", () => {
    const intent = normalizeAuthIntentDraft({
      action: "comment",
      returnTo:
        "/journal/balcony-tomato-check?tab=history&cursor=eyJwYWdlIjoyfQ#comments",
      target: { kind: "journal", ref: "balcony-tomato-check" },
    });

    expect(intent.returnTo).toBe(
      "/journal/balcony-tomato-check?tab=history&cursor=eyJwYWdlIjoyfQ#comments",
    );
    expect(buildAuthIntentResumeHref(intent)).toBe(
      "/journal/balcony-tomato-check?tab=history&cursor=eyJwYWdlIjoyfQ&authIntent=comment#comments",
    );

    expect(
      normalizeAuthIntentDraft({
        action: "comment",
        returnTo: "/bg/journal/balcony-tomato-check",
        target: { kind: "journal", ref: "balcony-tomato-check" },
      }).returnTo,
    ).toBe("/bg/journal/balcony-tomato-check");
  });

  it("preserves one opaque control locator without exposing a raw private id", () => {
    const intent = normalizeAuthIntentDraft({
      action: "publish",
      returnTo: "/garden/objects/18700003-0000-4000-8000-000000000003",
      control: "publish-f8c104ba6de751c2",
    });

    expect(buildAuthIntentResumeHref(intent)).toBe(
      "/garden/objects/18700003-0000-4000-8000-000000000003?authIntent=publish&authControl=publish-f8c104ba6de751c2#entry-publish-publish-f8c104ba6de751c2",
    );
    expect(normalizeAuthIntentResumeControl("publish-f8c104ba6de751c2")).toBe(
      "publish-f8c104ba6de751c2",
    );
    expect(
      normalizeAuthIntentResumeControl(["reply-safe", "reply-other"]),
    ).toBe("reply-safe");
    expect(
      normalizeAuthIntentResumeControl("../../private-entry-id"),
    ).toBeNull();
  });

  it("uses the exact action anchor and a safe enum-only resume marker", () => {
    expect(
      buildAuthIntentResumeHref(
        normalizeAuthIntentDraft({
          action: "bookmark",
          returnTo: "/variety/red-cherry",
          target: { kind: "collection", ref: "red-cherry" },
        }),
      ),
    ).toBe("/variety/red-cherry?authIntent=bookmark#engagement-bookmark");
    expect(
      buildAuthIntentResumeHref(
        normalizeAuthIntentDraft({
          action: "create_object",
          returnTo: "/garden",
        }),
      ),
    ).toBe("/garden?authIntent=create_object#first-entry-composer");
    expect(
      buildAuthIntentResumeHref(
        normalizeAuthIntentDraft({
          action: "save",
          returnTo: "/garden/objects/18700003-0000-4000-8000-000000000003",
        }),
      ),
    ).toBe(
      "/garden/objects/18700003-0000-4000-8000-000000000003?authIntent=save#follow-up-composer",
    );
    expect(normalizeAuthIntentResumeAction("publish")).toBe("publish");
    expect(normalizeAuthIntentResumeAction(["save", "comment"])).toBe("save");
    expect(normalizeAuthIntentResumeAction("delete-account")).toBeNull();
  });

  it.each([
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
    "/%2f%2fattacker.example/steal",
    "/journal/entry?next=https://attacker.example",
    "/unknown/private-route",
    "/journal/entry?email=person%40example.com",
    `/journal/${"a".repeat(120)}`,
  ])("rejects unsafe return location %s", (returnTo) => {
    expect(() =>
      normalizeAuthIntentDraft({
        action: "comment",
        returnTo,
        target: { kind: "journal", ref: "entry" },
      }),
    ).toThrow(AuthIntentContractError);
  });

  it.each([
    { kind: "journal", ref: "../private" },
    { kind: "object", ref: "not-a-uuid" },
    { kind: "profile", ref: "person@example.com" },
    { kind: "collection", ref: "x".repeat(100) },
  ])("rejects malformed public targets without echoing them", (target) => {
    expect(() =>
      normalizeAuthIntentDraft({
        action: "bookmark",
        returnTo: "/journal/entry",
        target,
      }),
    ).toThrow(AuthIntentContractError);
  });

  it("rejects incompatible target kinds and missing required targets", () => {
    expect(() =>
      normalizeAuthIntentDraft({
        action: "follow",
        returnTo: "/@demo_olena",
        target: { kind: "profile", ref: "demo_olena" },
      }),
    ).toThrow(AuthIntentContractError);

    expect(() =>
      normalizeAuthIntentDraft({
        action: "comment",
        returnTo: "/journal/entry",
      }),
    ).toThrow(AuthIntentContractError);
  });

  it.each(["raw.private.id", "reply:private", "x", "x".repeat(65)])(
    "rejects unsafe control locator %s",
    (control) => {
      expect(() =>
        normalizeAuthIntentDraft({
          action: "comment",
          returnTo: "/journal/entry",
          target: { kind: "journal", ref: "entry" },
          control,
        }),
      ).toThrow(AuthIntentContractError);
    },
  );

  it("drops unknown input properties instead of preserving private form data", () => {
    const intent = normalizeAuthIntentDraft({
      action: "save",
      returnTo: "/garden",
      body: "private journal body",
      email: "person@example.com",
      preciseLocation: "42.0000, 23.0000",
      rawIds: ["private-1", "private-2"],
    });

    expect(intent).toEqual({ action: "save", returnTo: "/garden" });
    expect(JSON.stringify(intent)).not.toMatch(
      /private journal|person@example|42\.0000|private-1/i,
    );
  });
});
