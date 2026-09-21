import { describe, expect, it } from "vitest";

import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import {
  getLocalizedAnswerPage,
  getLocalizedBlogPost,
  getLocalizedGuide,
  listLocalizedMarketLandings,
} from "@/server/public-localized-content";

describe("the public-only journal promise across the activation journey", () => {
  it.each(["uk", "bg", "ru"] as const)(
    "keeps %s help, publication, media and deletion consistent",
    (locale) => {
      const trust = getTrustSurfaceCopy(locale);
      const journey = JSON.stringify({
        auth: trust.authPanel.prompts,
        garden: trust.gardenGuest,
        composer: getGardenWorkspaceCopy(locale).composer,
        publication: getOwnerObjectCopy(locale).entryActions,
        notice: trust.firstPublication,
        privacy: trust.privacy,
        answer: getLocalizedAnswerPage(locale, "why-are-tomato-leaves-yellow"),
        guide: getLocalizedGuide(locale, "start-a-living-plant-record"),
        blog: getLocalizedBlogPost(
          locale,
          "ai-garden-advice-vs-real-garden-proof",
        ),
        markets: listLocalizedMarketLandings(locale),
      });
      expect(journey).not.toMatch(
        /перший приватний запис|первую приватную запись|първия личен запис|спершу збережіть приватний|сначала сохраните приватную|първо запазете личния/i,
      );
      expect(journey).not.toMatch(
        /очищені сервером|очищенные сервером|почистени от сървъра|7 днів невдалої обробки|7 дней неудачной обработки|7 дни неуспешна обработка/i,
      );
      expect(trust.firstPublication.lines[1]).toMatch(
        /пошукових|търсачки|поисковых/,
      );
      expect(trust.firstPublication.lines[3]).toContain("WebP");
      expect(trust.firstPublication.lines[4]).toMatch(
        /відновлення немає|няма възстановяване|восстановления нет/,
      );
      expect(trust.privacy.controls).toContain(trust.firstPublication.lines[1]);
      expect(trust.privacy.controls).toContain(trust.firstPublication.lines[3]);
      expect(trust.privacy.controls).toContain(trust.firstPublication.lines[4]);
      expect(trust.signOut.confirmationDescription).not.toMatch(
        /буде збережено|будут сохранены|ще бъдат запазени/,
      );
    },
  );
});
