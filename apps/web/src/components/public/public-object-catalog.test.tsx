import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getPublicObjectCatalogCopy } from "@/lib/public-object-catalog-copy";
import type { PublicObjectCatalogPage } from "@/server/public-object-catalog-repository";
import {
  buildPublicObjectCatalogContextModules,
  buildPublicObjectCatalogHref,
  PublicObjectCatalog,
} from "./public-object-catalog";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

vi.mock("@/components/site-shell/site-shell-context-rail", () => ({
  SiteShellContextRailRegistration: () => null,
  SiteShellContextRailModules: () => null,
}));

const copy = getPublicObjectCatalogCopy("uk");

const readyPage: PublicObjectCatalogPage = {
  request: { kind: "plant", identity: "species", query: "", page: 1 },
  totalCount: 7,
  totalPages: 2,
  hasPreviousPage: false,
  hasNextPage: true,
  cards: [
    {
      key: "catalog:species",
      objectKind: "plant",
      identityState: "catalog",
      identityName:
        "Solanum lycopersicum з винятково довгою перевірочною назвою для перенесення без виходу за межі картки",
      catalogKind: "species",
      catalogPath: "/variety/solanum-lycopersicum",
      objectCount: 2,
      journalCount: 5,
      representativeObject: {
        displayName: "Томат у теплиці",
        path: "/lineage/objects/object-1",
      },
      latestJournal: {
        title: "Спостереження після прохолодної ночі",
        path: "/journal/cold-night",
        entryDate: "2026-07-10",
      },
      mediaPublicUrl: "https://media.example/tomato.png",
    },
    {
      key: "unknown:plant",
      objectKind: "plant",
      identityState: "unknown",
      identityName: null,
      catalogKind: null,
      catalogPath: null,
      objectCount: 1,
      journalCount: 1,
      representativeObject: {
        displayName: "Томат без етикетки",
        path: "/lineage/objects/object-2",
      },
      latestJournal: {
        title: "Перший стиглий плід",
        path: "/journal/first-fruit",
        entryDate: "2026-07-09",
      },
      mediaPublicUrl: null,
    },
  ],
};

describe("public living-object catalog", () => {
  it("renders taxonomy, evidence counts, media, and one-click passport/journal paths", () => {
    const html = renderToStaticMarkup(
      <PublicObjectCatalog
        locale="uk"
        copy={copy}
        page={readyPage}
        state="ready"
      />,
    );

    expect(html).toContain('data-public-object-catalog="true"');
    expect(html).toContain(">Живі об&#x27;єкти</h1>");
    expect(html).toContain('aria-label="Класи живих об&#x27;єктів"');
    expect(html).toContain('href="/objects?kind=animal"');
    expect(html).toContain('href="/objects?kind=plant&amp;identity=species"');
    expect(html).not.toContain("identity=breed");
    expect(html).toContain('href="/lineage/objects/object-1"');
    expect(html).toContain('href="/journal/cold-night"');
    expect(html).toContain('href="/variety/solanum-lycopersicum"');
    expect(html).toContain("5 записів");
    expect(html).toContain("2 об&#x27;єкти");
    expect(html).toContain('src="https://media.example/tomato.png"');
    expect(html).toContain("break-words");
    // An own-name object reads as unknown on the public list (ADR-0026 D6):
    // no working-name badge, and never the label text.
    expect(html).toContain("Не визначено");
    expect(html).not.toContain("Робоча назва");
    expect(html).not.toContain("Домашня червона лінія");
    expect(html).toContain(
      'href="/objects?kind=plant&amp;identity=species&amp;page=2"',
    );
    expect(html).not.toMatch(/register|sign.?up|створити акаунт/i);
  });

  it("uses the same catalog-backed breed filter for every animal", () => {
    const animalHtml = renderToStaticMarkup(
      <PublicObjectCatalog
        locale="uk"
        copy={copy}
        page={{
          ...readyPage,
          request: { kind: "animal", identity: "all", query: "", page: 1 },
          cards: [],
        }}
        state="empty"
      />,
    );
    expect(animalHtml).toContain("Породи");
    expect(animalHtml).toContain("Види");
    expect(animalHtml).not.toContain("Сорти");
    expect(animalHtml).not.toContain("Породи та лінії");
    expect(animalHtml).toContain(
      'href="/objects?kind=animal&amp;identity=breed"',
    );
    expect(animalHtml.match(/lucide-paw-print/g)).toHaveLength(1);
  });

  it("renders searchable, recoverable empty, loading, and repository-error states", () => {
    const emptyHtml = renderToStaticMarkup(
      <PublicObjectCatalog
        locale="uk"
        copy={copy}
        page={{
          ...readyPage,
          request: {
            kind: "animal",
            identity: "breed",
            query: "відсутня",
            page: 1,
          },
          cards: [],
          totalCount: 0,
          totalPages: 1,
          hasNextPage: false,
        }}
        state="empty"
      />,
    );
    const loadingHtml = renderToStaticMarkup(
      <PublicObjectCatalog
        locale="uk"
        copy={copy}
        page={{ ...readyPage, cards: [] }}
        state="loading"
      />,
    );
    const errorHtml = renderToStaticMarkup(
      <PublicObjectCatalog
        locale="uk"
        copy={copy}
        page={{ ...readyPage, cards: [] }}
        state="error"
      />,
    );

    expect(emptyHtml).toContain("Нічого не знайдено");
    expect(emptyHtml).toContain('href="/objects"');
    expect(loadingHtml).toContain('aria-busy="true"');
    expect(errorHtml).toContain("Каталог тимчасово недоступний");
    expect(errorHtml).toContain(
      'href="/objects?kind=plant&amp;identity=species"',
    );
  });

  it("builds stable localized hrefs and route-owned context modules", () => {
    expect(
      buildPublicObjectCatalogHref("bg", {
        kind: "animal",
        identity: "breed",
        query: "Карника",
        page: 2,
      }),
    ).toBe(
      "/bg/objects?kind=animal&identity=breed&q=%D0%9A%D0%B0%D1%80%D0%BD%D0%B8%D0%BA%D0%B0&page=2",
    );
    const modules = buildPublicObjectCatalogContextModules(
      "ru",
      copy,
      readyPage,
    );
    expect(modules[0]).toMatchObject({
      key: "object-kinds",
      items: expect.arrayContaining([
        { href: "/ru/objects?kind=plant", label: "Рослини" },
      ]),
    });
    expect(modules[1]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/lineage/objects/object-1",
          label: "Томат у теплиці",
        }),
      ]),
    );
  });
});
