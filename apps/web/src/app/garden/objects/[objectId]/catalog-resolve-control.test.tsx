import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";

import {
  CATALOG_TYPEAHEAD_TIMEOUT_MS,
  CatalogResolveControl,
} from "./catalog-resolve-control";

const expectations = [
  ["uk", "Зіставити цей об'єкт із каталогом", "Відповідність каталогу"],
  ["bg", "Съпоставяне на обекта с каталога", "Съвпадение в каталога"],
  ["ru", "Сопоставить объект с каталогом", "Соответствие каталогу"],
] as const satisfies readonly [InterfaceLocale, string, string][];

describe("CatalogResolveControl localization", () => {
  it.each(expectations)(
    "localizes catalog controls in %s and preserves the catalog value",
    (locale, title, matchLabel) => {
      const catalogValue = "Solanum lycopersicum 'Balconi Red'";
      const html = renderToStaticMarkup(
        <CatalogResolveControl
          locale={locale}
          objectId="object-1"
          objectKind="plant"
          currentVarietyText={catalogValue}
          currentVarietyState="user_added"
          action={vi.fn()}
        />,
      );

      expect(html).toContain(title.replaceAll("'", "&#x27;"));
      expect(html).toContain(matchLabel);
      expect(html).toContain(catalogValue.replaceAll("'", "&#x27;"));
      expect(html).not.toMatch(
        /Match this object to the catalog|No catalog match chosen yet|Search seeded catalog/i,
      );
    },
  );
});

describe("CatalogResolveControl degraded behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("degraded timeout keeps clear catalog query and current identity continuation responsive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Timed out", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const renderer = await renderInteractiveControl();
    const queryInput = renderer.root
      .findAllByType("input")
      .find((input) => input.props.type !== "hidden")!;

    await act(async () => {
      queryInput.props.onChange({ target: { value: "томат" } });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CATALOG_TYPEAHEAD_TIMEOUT_MS);
    });

    expect(
      renderer.root.findAll(
        (node) =>
          node.type === "span" &&
          typeof node.props.children === "string" &&
          node.props.children === getOwnerObjectCopy("uk").catalog.unavailable,
      ),
    ).not.toHaveLength(0);
    const clearButton = renderer.root
      .findAllByType("button")
      .find((button) => button.props.type === "button")!;
    expect(queryInput.props.disabled).not.toBe(true);
    expect(clearButton.props.disabled).not.toBe(true);

    await act(async () => clearButton.props.onClick());
    expect(queryInput.props.value).toBe("");
    expect(
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.type === "submit")?.props.disabled,
    ).toBe(true);

    await act(async () => renderer.unmount());
  });
});

async function renderInteractiveControl() {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <CatalogResolveControl
        locale="uk"
        objectId="object-1"
        objectKind="plant"
        currentVarietyText="Cherry tomato"
        currentVarietyState="user_added"
        action={vi.fn()}
      />,
    );
  });
  return renderer!;
}
