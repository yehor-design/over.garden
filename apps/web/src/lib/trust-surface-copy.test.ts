import { describe, expect, it } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatTrustAuthPrompt,
  getLocalizedAuthClientErrorMessage,
  getLocalizedEmailSignUpResult,
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";

const LOCALES = [
  "uk",
  "bg",
  "ru",
] as const satisfies readonly InterfaceLocale[];

describe("trust-sensitive interface copy", () => {
  it("keeps exact copy-key parity across every supported interface locale", () => {
    const expectedShape = copyShape(getTrustSurfaceCopy("uk"));

    for (const locale of LOCALES) {
      expect(copyShape(getTrustSurfaceCopy(locale))).toEqual(expectedShape);
    }
  });

  it("localizes representative auth, recovery, legal, and privacy states", () => {
    expect(getTrustSurfaceCopy("uk").authIntent.expiredTitle).toBe(
      "Термін дії цього запиту на вхід минув",
    );
    expect(getTrustSurfaceCopy("bg").authHelp.title).toBe(
      "Нуждаете се от помощ за влизане?",
    );
    expect(getTrustSurfaceCopy("ru").erasure.status.reviewing.label).toBe(
      "На рассмотрении оператором",
    );
    expect(getTrustSurfaceCopy("bg").privacy.analytics.title).toBe(
      "Публични анализи",
    );
    expect(getTrustSurfaceCopy("ru").firstPublication.title).toBe(
      "Уведомление перед первой публикацией",
    );
    expect(getTrustSurfaceCopy("uk").signOut.action).toBe(
      "Вийти з облікового запису",
    );
    expect(getTrustSurfaceCopy("bg").signOut.syncFirst).toBe(
      "Първо синхронизиране",
    );
    expect(getTrustSurfaceCopy("ru").signOut.discardAndSignOut).toBe(
      "Удалить локальные изменения и выйти",
    );
    expect(getTrustSurfaceCopy("uk").signOut.signOutUnconfirmedError).toContain(
      "стан сеансу",
    );
    expect(
      getTrustSurfaceCopy("uk").signOut.signOutUnconfirmedError,
    ).not.toContain("залишаєтеся в обліковому записі");
  });

  it("keeps catalog and provider literals unchanged inside localized guidance", () => {
    const prompt = formatTrustAuthPrompt("bg", "public_variety", "Black Krim");

    expect(prompt).toContain("Black Krim");
    expect(prompt).toContain("Влезте");
    expect(getTrustSurfaceCopy("uk").authPanel.continueWith).toContain(
      "{provider}",
    );
  });

  it("maps auth and OAuth failures to locale-owned safe recovery copy", () => {
    expect(
      getLocalizedEmailSignUpResult("bg", {
        status: 422,
        message: "User already exists",
      }),
    ).toEqual({
      kind: "accepted",
      message: getTrustSurfaceCopy("bg").authPanel.signUpRequestAccepted,
    });
    expect(
      getLocalizedAuthClientErrorMessage("ru", {
        status: 401,
        message: "Invalid credentials",
      }),
    ).toContain("Неверный адрес электронной почты или пароль");
    expect(
      getLocalizedAuthClientErrorMessage("uk", {
        status: 500,
        message: "Database unavailable",
      }),
    ).toBeNull();
    expect(getLocalizedOAuthErrorMessage("uk", "account_not_linked")).toContain(
      "ще не пов'язано",
    );
    expect(getLocalizedOAuthErrorMessage("bg", "oauth_error")).toContain(
      "не завърши",
    );
  });

  it("contains no accidental English fallback outside documented literals", () => {
    const forbidden =
      /\b(?:sign in|password|create account|support and privacy|data retention|review boundaries|public analytics|turn off|not chosen|request status|first-publication disclosure|this invitation|what to expect)\b/i;

    for (const locale of LOCALES) {
      const authoredCopy = flattenStrings(getTrustSurfaceCopy(locale))
        .join("\n")
        .replaceAll("OverGarden", "")
        .replaceAll("MVP", "")
        .replaceAll("Google Tag Manager", "")
        .replaceAll("Google Analytics", "")
        .replaceAll("Microsoft Clarity", "")
        .replaceAll("Meta Ads", "")
        .replaceAll("Meta Pixel", "")
        .replaceAll("Meta Conversions API", "")
        .replaceAll("support.overgarden@gmail.com", "")
        .replaceAll("first-publication-v4", "")
        .replaceAll("erasure-request-mvp-v1", "");

      expect(authoredCopy).not.toMatch(forbidden);
    }
  });
});

function copyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyShape);
  if (typeof value === "string") return "string";
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, copyShape(nested)]),
    );
  }
  return typeof value;
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}
