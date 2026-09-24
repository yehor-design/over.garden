import { describe, expect, it } from "vitest";

import {
  buildLivingObjectTimeline,
  getLivingObjectPassportCopy,
  getLivingObjectPassportDomain,
} from "./living-object-passport";

describe("living-object passport presentation contract", () => {
  it.each([
    ["plant", "Рослина", "Сорт або вид", "Умови вирощування"],
    ["animal", "Тварина", "Вид або порода", "Умови утримання"],
  ] as const)(
    "uses meaningful Ukrainian domain labels for %s",
    (kind, kindLabel, identityLabel, contextLabel) => {
      expect(getLivingObjectPassportDomain("uk", kind)).toMatchObject({
        kindLabel,
        identityLabel,
        contextLabel,
      });
    },
  );

  // OG-UX-026: an animal is never a "plant species", in any of the three.
  // The Russian case was in the copy and in no test (OVE-478).
  it.each([
    ["bg", "plant", "Растение", "Сорт или вид", "Среда на отглеждане"],
    ["bg", "animal", "Животно", "Вид или порода", "Среда на отглеждане"],
    ["ru", "plant", "Растение", "Сорт или вид", "Условия выращивания"],
    ["ru", "animal", "Животное", "Вид или порода", "Условия содержания"],
  ] as const)(
    "uses the %s domain labels for %s",
    (locale, kind, kindLabel, identityLabel, contextLabel) => {
      const domain = getLivingObjectPassportDomain(locale, kind);
      expect(domain).toMatchObject({ kindLabel, identityLabel, contextLabel });
      if (kind === "animal") {
        expect(Object.values(domain).join(" ")).not.toMatch(/растени|сорт /iu);
      }
    },
  );

  it("ships equivalent Bulgarian and Russian passport actions", () => {
    expect(getLivingObjectPassportCopy("bg")).toMatchObject({
      addUpdate: "Нов запис",
      readLatest: "Прочетете последния запис",
      showAll: "Покажи всички записи",
    });
    expect(getLivingObjectPassportCopy("ru")).toMatchObject({
      addUpdate: "Новая запись",
      readLatest: "Читать последнюю запись",
      showAll: "Показать все записи",
    });
  });

  it("keeps deterministic newer and older navigation in descending chronology", () => {
    const timeline = buildLivingObjectTimeline([
      timelineEntry("entry-2", "2026-07-12", "/journal/entry-2"),
      timelineEntry("entry-1", "2026-07-10", "/journal/entry-1"),
      timelineEntry("entry-0", "2025-11-02", "/journal/entry-0"),
    ]);

    expect(timeline.map((entry) => entry.id)).toEqual([
      "entry-2",
      "entry-1",
      "entry-0",
    ]);
    expect(timeline[0]).toMatchObject({
      newer: null,
      older: { id: "entry-1", href: "/journal/entry-1" },
      year: "2026",
    });
    expect(timeline[1]).toMatchObject({
      newer: { id: "entry-2", href: "/journal/entry-2" },
      older: { id: "entry-0", href: "/journal/entry-0" },
      year: "2026",
    });
    expect(timeline[2]).toMatchObject({
      newer: { id: "entry-1", href: "/journal/entry-1" },
      older: null,
      year: "2025",
    });
  });
});

function timelineEntry(id: string, entryDate: string, href: string) {
  return {
    id,
    title: id,
    body: `${id} body`,
    entryDate,
    href,
    mediaPublicUrl: null,
    stateLabel: "Public",
    relationLabel: "Object update",
  };
}
