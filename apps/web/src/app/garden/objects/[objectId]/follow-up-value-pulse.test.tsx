import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { FollowUpValuePulse } from "./follow-up-value-pulse";

const expectations = [
  ["uk", "Коротка приватна перевірка", "Так, варто зберігати"],
  ["bg", "Кратка частна проверка", "Да, струва си да се пази"],
  ["ru", "Короткая приватная проверка", "Да, стоит сохранять"],
] as const satisfies readonly [InterfaceLocale, string, string][];

describe("FollowUpValuePulse localization", () => {
  it.each(expectations)(
    "localizes the private value pulse in %s",
    (locale, title, usefulLabel) => {
      const html = renderToStaticMarkup(
        <FollowUpValuePulse
          locale={locale}
          objectId="object-1"
          journalEntryId="entry-1"
        />,
      );

      expect(html).toContain(title);
      expect(html).toContain(usefulLabel);
      expect(html).not.toMatch(
        /Quick private check-in|Yes, worth keeping|Feedback could not be saved/i,
      );
    },
  );
});
