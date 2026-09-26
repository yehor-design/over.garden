import { describe, expect, it } from "vitest";

import { PUBLIC_LOCALES } from "@/lib/public-localization";

import { REPORT_DECISION_GROUNDS, REPORT_REASONS } from "./report-contract";
import { getReportCopy } from "./report-copy";

describe("the complaint procedure's words", () => {
  it("name every reason and every ground in every language", () => {
    for (const locale of PUBLIC_LOCALES) {
      const copy = getReportCopy(locale);
      for (const reason of REPORT_REASONS) {
        expect(copy.form.reasons[reason], `${locale} ${reason}`).toBeTruthy();
      }
      for (const ground of REPORT_DECISION_GROUNDS) {
        expect(copy.owner.grounds[ground], `${locale} ${ground}`).toBeTruthy();
        expect(
          copy.mail.groundLine[ground],
          `${locale} ${ground}`,
        ).toBeTruthy();
      }
    }
  });

  it("write a statement of reasons with everything DSA Art. 17 asks for", () => {
    for (const locale of PUBLIC_LOCALES) {
      const copy = getReportCopy(locale);
      const body = copy.mail.statementBody({
        restricted: copy.mail.restricted.entry(
          "https://over.garden/@olena/post/7",
        ),
        facts: "FACTS",
        ground: copy.mail.groundLine["terms-content"],
        supportEmail: "support@example.test",
      });
      // What was restricted, the facts, the ground, that a person decided,
      // and how to contest it.
      expect(body, locale).toContain("https://over.garden/@olena/post/7");
      expect(body, locale).toContain("FACTS");
      expect(body, locale).toContain("terms#terms-content");
      expect(body, locale).toMatch(/автоматиз|automat|автоматизац/iu);
      expect(body, locale).toContain("support@example.test");
    }
  });

  it("tell the reporter the decision and why", () => {
    const copy = getReportCopy("uk");
    const body = copy.mail.decisionBody({
      address: "https://over.garden/@olena/post/7",
      decision: "removed",
      facts: "Погрози підтвердились.",
    });
    expect(body).toContain("Рішення: вміст прибрано.");
    expect(body).toContain("Погрози підтвердились.");
  });
});
