import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import type {
  GardenCollectionObjectItem,
  GardenCollectionSpaceItem,
  GardenObjectsGroup,
  GardenSpacesGroup,
} from "@/lib/garden/garden-collection";
import { normalizeGardenCollectionRequest } from "@/lib/garden/garden-collection";

import { GardenActions, GardenCollection, GardenSetup } from "./garden-collection";

const TODAY = "2026-09-23";

function space(index: number): GardenCollectionSpaceItem {
  return {
    kind: "space",
    id: `space-${index}`,
    displayName: `Простір ${index}`,
    objectCount: index,
    lastEntryDate: index === 1 ? "2026-09-20" : null,
  };
}

function object(index: number): GardenCollectionObjectItem {
  return {
    kind: "object",
    id: `object-${index}`,
    displayName: "Томат",
    objectKind: index % 2 ? "animal" : "plant",
    species: index === 0 ? "Solanum lycopersicum" : null,
    space: { id: `space-${index}`, displayName: `Простір ${index}` },
    lastEntryDate: index === 0 ? "2026-09-22" : null,
  };
}

function render(
  params: Record<string, string>,
  spaces:
    | { status: "ready"; value: GardenSpacesGroup }
    | {
        status: "error";
        failureClass: "query_timeout";
        digest: string;
        relation: null;
      },
  objects:
    | { status: "ready"; value: GardenObjectsGroup }
    | {
        status: "error";
        failureClass: "query_timeout";
        digest: string;
        relation: null;
      },
  simple = false,
) {
  return renderToStaticMarkup(
    <GardenCollection
      locale="uk"
      request={normalizeGardenCollectionRequest(params)}
      today={TODAY}
      spaces={spaces}
      objects={objects}
      simple={simple}
    />,
  );
}

const ready = <T,>(value: T) => ({ status: "ready" as const, value });
const failed = {
  status: "error" as const,
  failureClass: "query_timeout" as const,
  digest: "ABC1234",
  relation: null,
};

describe("GardenCollection", () => {
  it("names its actions as links, and its search as a labelled field", () => {
    const actions = renderToStaticMarkup(<GardenActions locale="bg" />);
    expect(actions).toContain('aria-label="Действия в градината"');
    expect(actions).toContain('href="/garden/new"');
    expect(actions).toContain("Добави растение или животно");

    const html = render(
      {},
      ready({ items: [space(1)], total: 1, owned: 1 }),
      ready({ items: [object(0), object(1)], total: 40, owned: 40 }),
    );
    expect(html).toContain('<label for="garden-collection-search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('role="status"');
  });

  it("keeps a group's count a word of its own in the heading's name", () => {
    // `OVE-478`: Orca read "Простори3" — the count was a margin away, with no
    // space in the name. A `{" "}` after the title is not enough: React
    // writes it after a `<!-- -->`, and Chromium drops a space standing
    // alone there. Rendered as the server streams it, separators included.
    const html = renderToString(
      <GardenCollection
        locale="uk"
        request={normalizeGardenCollectionRequest({})}
        today={TODAY}
        spaces={ready({ items: [space(1)], total: 3, owned: 3 })}
        objects={ready({ items: [object(0)], total: 3, owned: 3 })}
        simple={false}
      />,
    );
    expect(html).toMatch(/>Простори <span[^>]*>3<\/span>/u);
    expect(html).toMatch(/>Рослини й тварини <span[^>]*>3<\/span>/u);
  });

  it("tells two tomatoes apart by their space, and states recency as a fact", () => {
    const html = render(
      {},
      ready({ items: [], total: 0, owned: 0 }),
      ready({ items: [object(0), object(1)], total: 2, owned: 2 }),
      true,
    );
    expect(html).toContain("Рослина · Простір 0 · Solanum lycopersicum");
    expect(html).toContain("Тварина · Простір 1");
    expect(html).toContain('<time dateTime="2026-09-22">учора</time>');
    expect(html).toContain("Ще без записів");
    // A garden read whole: no search box and a status that is only heard.
    expect(html).not.toContain('name="q"');
    expect(html).toContain('class="sr-only"');
  });

  it("pages the plants and keeps the query in every page link", () => {
    const html = render(
      { q: "Томат", page: "2" },
      ready({ items: [], total: 0, owned: 3 }),
      ready({
        items: Array.from({ length: 24 }, (_, index) => object(index)),
        total: 50,
        owned: 90,
      }),
    );
    expect(html).toContain("Сторінка 2 з 3");
    expect(html).toContain(
      'href="/garden?q=%D0%A2%D0%BE%D0%BC%D0%B0%D1%82#garden-collection"',
    );
    expect(html).toContain(
      'href="/garden?q=%D0%A2%D0%BE%D0%BC%D0%B0%D1%82&amp;page=3#garden-collection"',
    );
    // The empty spaces group steps aside during a search.
    expect(html).not.toContain('id="garden-spaces"');
  });

  it("offers every space once there are more than fit beside the plants", () => {
    const html = render(
      {},
      ready({
        items: Array.from({ length: 6 }, (_, index) => space(index + 1)),
        total: 20,
        owned: 20,
      }),
      ready({ items: [object(0)], total: 1, owned: 1 }),
    );
    expect(html).toContain('data-garden-all-spaces="true"');
    expect(html).toContain('href="/garden?kind=space"');
    expect(html).toContain("Усі простори (20)");
  });

  it("keeps a failed group's retry beside the group that answered, and never says empty", () => {
    const html = render(
      {},
      failed,
      ready({ items: [object(0)], total: 1, owned: 1 }),
    );
    expect(html).toContain('id="garden-spaces"');
    expect(html).toContain('data-section-failure="query_timeout"');
    expect(html).toContain('href="/garden#garden-spaces"');
    expect(html).toContain("Не вдалося показати простори");
    expect(html).toContain('id="garden-object-object-0"');
    expect(html).not.toContain("Просторів ще немає.");
    // The sentence leaves the failed group out rather than counting nought.
    expect(html).toContain("У саду — рослини й тварини: 1");
    expect(html).not.toContain("простори: 0");
  });

  it("says nothing was found only when every shown group answered nothing", () => {
    const none = render(
      { q: "кактус" },
      ready({ items: [], total: 0, owned: 2 }),
      ready({ items: [], total: 0, owned: 5 }),
    );
    expect(none).toContain('data-garden-no-results="true"');
    expect(none).toContain('href="/garden"');

    const unknown = render(
      { q: "кактус" },
      failed,
      ready({ items: [], total: 0, owned: 5 }),
    );
    expect(unknown).not.toContain('data-garden-no-results="true"');
    expect(unknown).toContain('data-section-failure="query_timeout"');
  });

  // ADR-0035 D1: exactly two ways to start, and no form on the page.
  it("sets up an empty garden with one picture and exactly two buttons", () => {
    const html = renderToStaticMarkup(<GardenSetup locale="uk" />);
    expect(html).toContain('data-screen-state="empty-first-run"');
    expect(html).toContain("/illustrations/empty-garden.webp");
    const actions = [...html.matchAll(/data-garden-setup-action="([a-z-]+)"/gu)].map(
      (match) => match[1],
    );
    expect(actions).toEqual(["add-space", "add-object"]);
    expect(html.indexOf("Створити простір")).toBeLessThan(
      html.indexOf("Додати рослину чи тварину"),
    );
    expect(html).toContain('href="/garden/spaces/new"');
    expect(html).toContain('href="/garden/objects/new"');
    expect(html).not.toContain("data-local-composer-kind");
    expect(html).not.toContain("<form");
  });
});
