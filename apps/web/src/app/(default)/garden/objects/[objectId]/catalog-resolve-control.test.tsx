import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import { CATALOG_PICKER_DEBOUNCE_MS } from "@/components/garden/catalog-picker";

import { CatalogResolveControl } from "./catalog-resolve-control";

vi.mock("../../catalog-search-miss-actions", () => ({
  recordCatalogSearchMissAction: vi.fn(async () => ({ recorded: true })),
}));

const expectations = [
  ["uk", "Зіставити цей об'єкт із каталогом", "Відповідність каталогу"],
  ["bg", "Съпоставяне на обекта с каталога", "Съвпадение в каталога"],
  ["ru", "Сопоставить объект с каталогом", "Соответствие каталогу"],
] as const satisfies readonly [InterfaceLocale, string, string][];

describe("CatalogResolveControl localization", () => {
  it.each(expectations)(
    "localizes catalog controls in %s, preserves the current label and renders no trust word",
    (locale, title, matchLabel) => {
      const catalogValue = "Solanum lycopersicum 'Balconi Red'";
      const html = renderToStaticMarkup(
        <CatalogResolveControl
          locale={locale}
          objectId="object-1"
          objectKind="plant"
          currentVarietyText={catalogValue}
          currentVarietyState="free_text"
          action={vi.fn()}
        />,
      );

      expect(html).toContain(title.replaceAll("'", "&#x27;"));
      expect(html).toContain(matchLabel);
      expect(html).toContain(catalogValue.replaceAll("'", "&#x27;"));
      expect(html).toContain('role="combobox"');
      expect(html).toContain('role="listbox"');
      expect(html).toContain('name="catalogLabel"');
      expect(html).not.toMatch(
        /Match this object to the catalog|No catalog match chosen yet|Search seeded catalog|trustLabel|sourceCaveat|Перевірено|Підтверджено джерелом|Кандидат|карантин/i,
      );
    },
  );
});

describe("CatalogResolveControl when the picker route is down", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the own-name outcome, the clear control and the current identity when the route answers 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    const renderer = await renderInteractiveControl();
    const queryInput = renderer.root.find(
      (node) => node.type === "input" && node.props.role === "combobox",
    );

    await act(async () => {
      queryInput.props.onChange({ target: { value: "Де Барао" } });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CATALOG_PICKER_DEBOUNCE_MS + 5);
    });

    const copy = getGardenWorkspaceCopy("uk").composer.catalogPicker;
    const status = renderer.root.find(
      (node) =>
        node.type === "p" && node.props["data-catalog-availability"] !== undefined,
    );
    expect(status.props["data-catalog-availability"]).toBe("unavailable");
    expect(status.props.children).toBe(copy.unavailable);

    const ownName = renderer.root.find(
      (node) =>
        node.type === "li" && node.props["data-catalog-option"] === "own_name",
    );
    expect(ownName).toBeTruthy();
    expect(queryInput.props.disabled).not.toBe(true);

    await act(async () => ownName.props.onClick());
    const labelField = renderer.root.find(
      (node) => node.type === "input" && node.props.name === "catalogLabel",
    );
    expect(labelField.props.value).toBe("Де Барао");
    expect(
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.type === "submit")?.props.disabled,
    ).toBe(false);

    const clearButton = renderer.root
      .findAllByType("button")
      .find((button) => button.props.type === "button")!;
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
        currentVarietyState="unknown"
        action={vi.fn()}
      />,
    );
  });
  return renderer!;
}
