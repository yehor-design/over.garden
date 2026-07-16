import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  OwnerLivingObjectPassportPresentation,
  PublicLivingObjectPassportPresentation,
} from "@/lib/living-object-passport";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
}));

import {
  LivingObjectPassportContextRail,
  LivingObjectPassportOverview,
  OwnerLivingObjectPassportTimeline,
  PublicLivingObjectPassportTimeline,
  buildLivingObjectPassportContextModules,
} from "./living-object-passport";

describe("living-object passport V2 components", () => {
  it("renders public identity, caretaker, facts, media, chronology, and a read-open next route", () => {
    const passport = publicPresentation();
    const html = renderToStaticMarkup(
      <>
        <LivingObjectPassportContextRail passport={passport} locale="uk" />
        <LivingObjectPassportOverview passport={passport} locale="uk" />
        <PublicLivingObjectPassportTimeline passport={passport} locale="uk" />
      </>,
    );

    expect(html).toContain('data-living-object-passport="overview"');
    expect(html).toContain('data-passport-audience="public"');
    expect(html).toContain('data-object-kind="plant"');
    expect(html).toContain("Балконний томат");
    expect(html).toContain("Помідор чері");
    expect(html).toContain("Yehor");
    expect(html).toContain("@yehor");
    expect(html).toContain("Читати останній запис");
    expect(html).toContain('href="/journal/entry-7"');
    expect(html).toContain("https://media.over.garden/object.webp");
    expect(html).toContain("Показати всі записи");
    expect(html).toContain("Новіший запис");
    expect(html).toContain("Старіший запис");
    expect(html).not.toMatch(/privacy control|catalog resolve|publish entry/i);
  });

  it("renders a stable owner empty state and keeps management actions outside presentation data", () => {
    const passport = ownerPresentation([]);
    const html = renderToStaticMarkup(
      <>
        <LivingObjectPassportOverview passport={passport} locale="uk" />
        <OwnerLivingObjectPassportTimeline
          passport={passport}
          locale="uk"
          renderEntryActions={() => <form>Owner action</form>}
        />
      </>,
    );

    expect(html).toContain('data-passport-audience="owner"');
    expect(html).toContain('data-object-kind="animal"');
    expect(html).toContain("Новий паспорт");
    expect(html).toContain("Фото ще немає");
    expect(html).toContain(
      "Додайте перший датований запис, щоб почати історію.",
    );
    expect(html).not.toContain("Owner action");
    expect(JSON.stringify(passport)).not.toContain("Owner action");
  });

  it("uses the compact heading tier for long object names", () => {
    const passport = {
      ...publicPresentation(),
      displayName:
        "Довга назва експериментального томата для перевірки перенесення рядків",
    };
    const html = renderToStaticMarkup(
      <LivingObjectPassportOverview passport={passport} locale="uk" />,
    );

    expect(html).toMatch(/<h1 class="[^"]*text-xl[^"]*sm:text-3xl/);
  });

  it("renders owner entry controls only for loaded owner entries", () => {
    const passport = ownerPresentation([
      publicPresentation().timeline.entries[0],
    ]);
    const html = renderToStaticMarkup(
      <OwnerLivingObjectPassportTimeline
        passport={passport}
        locale="uk"
        renderEntryActions={(entry) => (
          <form data-owner-entry={entry.id}>Owner action</form>
        )}
      />,
    );

    expect(html).toContain('data-owner-entry="entry-7"');
    expect(html).toContain("Owner action");
  });

  it.each([
    ["uk", "Фото до запису «Запис 7»"],
    ["bg", "Снимка към записа „Запис 7“"],
    ["ru", "Фото к записи «Запис 7»"],
  ] as const)("localizes timeline media alternatives in %s", (locale, alt) => {
    const passport = publicPresentation();
    const html = renderToStaticMarkup(
      <PublicLivingObjectPassportTimeline
        passport={passport}
        locale={locale}
      />,
    );

    expect(html).toContain(`alt="${alt}"`);
    expect(html).not.toContain('alt="Запис 7 photo"');
  });

  it("builds route-owned context modules without private payload fields", () => {
    const modules = buildLivingObjectPassportContextModules(
      publicPresentation(),
      "uk",
    );

    expect(modules.map((module) => module.key)).toEqual([
      "passport-object",
      "passport-journal",
      "passport-provenance",
    ]);
    expect(modules[1].items).toHaveLength(3);
    expect(JSON.stringify(modules)).not.toMatch(
      /owner_user_id|private|email|location_visibility|coarse_region/i,
    );
  });
});

function publicPresentation(): PublicLivingObjectPassportPresentation {
  const entries = Array.from({ length: 7 }, (_, index) => {
    const number = 7 - index;
    return {
      id: `entry-${number}`,
      title: `Запис ${number}`,
      body: `Зміст запису ${number}`,
      entryDate: `2026-07-${String(number).padStart(2, "0")}`,
      href: `/journal/entry-${number}`,
      mediaPublicUrl:
        number === 7 ? "https://media.over.garden/object.webp" : null,
      stateLabel: "Публічний запис",
      relationLabel: "Запис об'єкта",
      year: "2026",
      newer:
        index === 0
          ? null
          : {
              id: `entry-${number + 1}`,
              title: `Запис ${number + 1}`,
              href: `/journal/entry-${number + 1}`,
            },
      older:
        index === 6
          ? null
          : {
              id: `entry-${number - 1}`,
              title: `Запис ${number - 1}`,
              href: `/journal/entry-${number - 1}`,
            },
    };
  });

  return {
    audience: "public",
    objectId: "object-1",
    objectKind: "plant",
    displayName: "Балконний томат",
    passportLabel: "Публічний паспорт",
    breadcrumbs: [
      { href: "/objects", label: "Живі об'єкти" },
      { href: null, label: "Балконний томат" },
    ],
    identity: {
      label: "Сорт або вид",
      value: "Помідор чері",
      state: "Підтверджено каталогом",
      catalogKind: "plant_variety",
      catalogPath: "/variety/tomato",
    },
    caretaker: {
      displayName: "Yehor",
      mention: "@yehor",
      avatarUrl: null,
      profilePath: "/@yehor",
    },
    status: { label: "Журнал активний", latestDate: "2026-07-07" },
    facts: [
      { key: "kind", label: "Рослина", value: "Помідор чері" },
      {
        key: "context",
        label: "Умови вирощування",
        value: "Місце приховано",
      },
      {
        key: "first",
        label: "Перше спостереження",
        value: "1 лип. 2026 р.",
      },
      {
        key: "latest",
        label: "Останнє спостереження",
        value: "7 лип. 2026 р.",
      },
      { key: "count", label: "Хронологія", value: "7 записів" },
      { key: "state", label: "Поточний стан", value: "Журнал активний" },
    ],
    cover: {
      publicUrl: "https://media.over.garden/object.webp",
      alt: "Балконний томат",
    },
    gallery: [
      {
        publicUrl: "https://media.over.garden/object.webp",
        alt: "Балконний томат",
      },
    ],
    timeline: {
      totalCount: 7,
      loadedCount: 7,
      hasMore: false,
      entries,
    },
    provenance: { count: 2, label: "Підтверджене походження" },
    primaryAction: {
      href: "/journal/entry-7",
      label: "Читати останній запис",
    },
    secondaryActions: [{ href: "/variety/tomato", label: "Відкрити каталог" }],
  };
}

function ownerPresentation(
  entries: OwnerLivingObjectPassportPresentation["timeline"]["entries"],
): OwnerLivingObjectPassportPresentation {
  const base = publicPresentation();
  return {
    ...base,
    audience: "owner",
    objectKind: "animal",
    passportLabel: "Мій паспорт об'єкта",
    status: {
      label: entries.length > 0 ? "Журнал активний" : "Новий паспорт",
      latestDate: entries[0]?.entryDate ?? null,
    },
    cover: entries.length > 0 ? base.cover : null,
    gallery: entries.length > 0 ? base.gallery : [],
    timeline: {
      totalCount: entries.length,
      loadedCount: entries.length,
      hasMore: false,
      entries,
    },
    primaryAction: { href: "#follow-up-composer", label: "Новий запис" },
    ownerContext: {
      spaceId: "space-1",
      spaceName: "Домашнє господарство",
      locationLabel: "Місце приховано",
    },
  };
}
