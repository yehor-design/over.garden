import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type {
  CatalogFullCatalogueRow,
  CatalogPickerSelection,
} from "@/lib/garden/catalog-typeahead-contract";

import {
  CATALOG_PICKER_DEBOUNCE_MS,
  CatalogPicker,
  type CatalogPickerFetchResult,
  type CatalogSearchMiss,
} from "./catalog-picker";

const copy = getGardenWorkspaceCopy("uk").composer.catalogPicker;

const ROWS: CatalogPickerFetchResult["rows"] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    displayName: "Помідор",
    matchedName: "томат",
    kind: "species",
    publicPath: "/species/solanum-lycopersicum",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    displayName: "Де Барао",
    kind: "cultivar",
    parentDisplayName: "Помідор",
  },
];

describe("CatalogPicker markup", () => {
  it("is a WAI-ARIA combobox with an inline listbox and no trust word", () => {
    const html = renderToStaticMarkup(
      <CatalogPicker
        locale="uk"
        objectKind="plant"
        copy={copy}
        label="Відповідність каталогу"
        placeholder="Вид, сорт чи порода — або своя назва"
        clearLabel="Очистити"
        selection={null}
        onSelectionChange={() => undefined}
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain(copy.outcomes);
    expect(html).not.toMatch(/role="dialog"|trust|caveat|Перевірено/iu);
  });

  it("shows a preselected card by name with its kind", () => {
    const html = renderToStaticMarkup(
      <CatalogPicker
        locale="uk"
        objectKind="plant"
        copy={copy}
        label="Відповідність каталогу"
        placeholder=""
        clearLabel="Очистити"
        selection={{ kind: "item", row: ROWS[0]! }}
        onSelectionChange={() => undefined}
      />,
    );

    expect(html).toContain('value="Помідор"');
    expect(html).toContain("Вид: Помідор");
    expect(html).toContain('data-catalog-availability="selected"');
  });
});

describe("CatalogPicker behaviour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("offers the rows and the own-name outcome, moves the active option with the arrow keys and picks with Enter", async () => {
    const selections: Array<CatalogPickerSelection | null> = [];
    const misses: CatalogSearchMiss[] = [];
    const renderer = await renderPicker({
      fetchRows: async () => ({ rows: ROWS, availability: "ready" }),
      onSelectionChange: (selection) => selections.push(selection),
      onSearchMiss: (miss) => misses.push(miss),
    });
    const input = comboboxOf(renderer);

    await type(renderer, "томат");
    const options = renderer.root.findAll((node) => node.type === "li");
    expect(options.map((option) => option.props["data-catalog-option"])).toEqual([
      "species",
      "cultivar",
      "own_name",
    ]);
    expect(comboboxOf(renderer).props["aria-expanded"]).toBe(true);
    expect(options[1]!.props.children.props.children[1].props.children).toBe(
      "Сорт · Помідор",
    );

    await press(renderer, "ArrowDown");
    expect(comboboxOf(renderer).props["aria-activedescendant"]).toBe(
      options[0]!.props.id,
    );
    await press(renderer, "ArrowDown");
    await press(renderer, "ArrowDown");
    expect(comboboxOf(renderer).props["aria-activedescendant"]).toBe(
      options[2]!.props.id,
    );
    await press(renderer, "ArrowUp");
    expect(comboboxOf(renderer).props["aria-activedescendant"]).toBe(
      options[1]!.props.id,
    );

    await press(renderer, "Enter");
    expect(selections).toEqual([{ kind: "item", row: ROWS[1] }]);
    expect(misses).toEqual([]);
    void input;

    await act(async () => renderer.unmount());
  });

  it("records a miss when the own name is chosen and when the field is left without a pick", async () => {
    const selections: Array<CatalogPickerSelection | null> = [];
    const misses: CatalogSearchMiss[] = [];
    const renderer = await renderPicker({
      fetchRows: async () => ({ rows: [], availability: "empty" }),
      onSelectionChange: (selection) => selections.push(selection),
      onSearchMiss: (miss) => misses.push(miss),
    });

    await type(renderer, "Де Барао");
    const ownName = renderer.root.find(
      (node) =>
        node.type === "li" && node.props["data-catalog-option"] === "own_name",
    );
    expect(ownName.props.children.props.children).toBe(
      "Додати як мою назву: «Де Барао»",
    );
    await act(async () => ownName.props.onClick());
    expect(selections).toEqual([{ kind: "own_name", name: "Де Барао" }]);
    expect(misses).toEqual([{ query: "Де Барао", reason: "own_name" }]);

    await act(async () => renderer.unmount());

    const abandoned: CatalogSearchMiss[] = [];
    const second = await renderPicker({
      fetchRows: async () => ({ rows: [], availability: "empty" }),
      onSelectionChange: () => undefined,
      onSearchMiss: (miss) => abandoned.push(miss),
    });
    await type(second, "Марʼяна");
    await act(async () => {
      comboboxOf(second).props.onBlur();
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(abandoned).toEqual([{ query: "Марʼяна", reason: "abandoned" }]);
    await act(async () => second.unmount());
  });

  it("keeps the own-name outcome alone when the route is unavailable", async () => {
    const renderer = await renderPicker({
      fetchRows: async () => {
        throw new Error("503");
      },
      onSelectionChange: () => undefined,
    });

    await type(renderer, "Де Барао");
    const options = renderer.root.findAll((node) => node.type === "li");
    expect(options.map((option) => option.props["data-catalog-option"])).toEqual([
      "own_name",
    ]);
    const status = renderer.root.find(
      (node) =>
        node.type === "p" && node.props["data-catalog-availability"] !== undefined,
    );
    expect(status.props["data-catalog-availability"]).toBe("unavailable");
    expect(status.props.children).toBe(copy.unavailable);

    await act(async () => renderer.unmount());
  });
});

async function renderPicker(input: {
  fetchRows: () => Promise<CatalogPickerFetchResult>;
  onSelectionChange: (selection: CatalogPickerSelection | null) => void;
  onSearchMiss?: (miss: CatalogSearchMiss) => void;
  fetchFullCatalogue?: () => Promise<CatalogFullCatalogueRow[]>;
  materializeFromCatalogue?: (
    colId: string,
  ) => Promise<CatalogPickerFetchResult["rows"][number] | null>;
}) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <CatalogPicker
        locale="uk"
        objectKind="plant"
        copy={copy}
        label="Відповідність каталогу"
        placeholder=""
        clearLabel="Очистити"
        selection={null}
        onSelectionChange={input.onSelectionChange}
        onSearchMiss={input.onSearchMiss}
        fetchRows={input.fetchRows}
        fetchFullCatalogue={input.fetchFullCatalogue}
        materializeFromCatalogue={input.materializeFromCatalogue}
      />,
    );
  });
  return renderer!;
}

function comboboxOf(renderer: ReactTestRenderer) {
  return renderer.root.find(
    (node) => node.type === "input" && node.props.role === "combobox",
  );
}

async function type(renderer: ReactTestRenderer, value: string) {
  await act(async () => {
    comboboxOf(renderer).props.onChange({ target: { value } });
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CATALOG_PICKER_DEBOUNCE_MS + 5);
  });
}

async function press(renderer: ReactTestRenderer, key: string) {
  await act(async () => {
    comboboxOf(renderer).props.onKeyDown({ key, preventDefault: () => undefined });
  });
}

describe("CatalogPicker as the composer's name field", () => {
  // The suite runs in the node environment; the picker's debounce reaches for
  // window, as the behaviour suite above documents.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // A gardener picks the species, then names their own plant. The two fields
  // used to be separate, so renaming could not unpick anything; now they are
  // one control and the identity has to survive the rename on its own. The
  // browser proof caught this as an object saved with variety_state
  // "unknown" after a pick, which is the whole graph quietly lost.
  it("keeps a picked organism when the gardener renames their plant", async () => {
    const changes: (CatalogPickerSelection | null)[] = [];
    const picked: CatalogPickerSelection = { kind: "item", row: ROWS[0]! };
    const html = renderToStaticMarkup(
      <CatalogPicker
        locale="uk"
        objectKind="plant"
        copy={copy}
        label="Назва"
        placeholder=""
        clearLabel="Очистити"
        inputName="plantName"
        required
        query="Помідор"
        onQueryChange={() => undefined}
        selection={picked}
        onSelectionChange={(selection) => changes.push(selection)}
      />,
    );
    // The picked organism stays named beside the field a gardener is editing.
    expect(html).toContain('data-catalog-availability="selected"');

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <CatalogPicker
          locale="uk"
          objectKind="plant"
          copy={copy}
          label="Назва"
          placeholder=""
          clearLabel="Очистити"
          inputName="plantName"
          required
          query="Помідор"
          onQueryChange={() => undefined}
          selection={picked}
          onSelectionChange={(selection) => changes.push(selection)}
        />,
      );
    });
    await act(async () => {
      comboboxOf(renderer!).props.onChange({ target: { value: "Васька" } });
    });
    expect(changes).toEqual([]);
    await act(async () => renderer!.unmount());
  });

  it("replaces an own name, because the own name is the text", async () => {
    const changes: (CatalogPickerSelection | null)[] = [];
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <CatalogPicker
          locale="uk"
          objectKind="plant"
          copy={copy}
          label="Назва"
          placeholder=""
          clearLabel="Очистити"
          inputName="plantName"
          required
          query="Васька"
          onQueryChange={() => undefined}
          selection={{ kind: "own_name", name: "Васька" }}
          onSelectionChange={(selection) => changes.push(selection)}
        />,
      );
    });
    await act(async () => {
      comboboxOf(renderer!).props.onChange({ target: { value: "Мурка" } });
    });
    expect(changes).toEqual([null]);
    await act(async () => renderer!.unmount());
  });

  it("still ends the search on a pick when it is not the name field", async () => {
    // The object page's resolve control keeps the behaviour it always had.
    const html = renderToStaticMarkup(
      <CatalogPicker
        locale="uk"
        objectKind="plant"
        copy={copy}
        label="Відповідність каталогу"
        placeholder=""
        clearLabel="Очистити"
        selection={{ kind: "item", row: ROWS[0]! }}
        onSelectionChange={() => undefined}
      />,
    );
    expect(html).not.toContain('name="plantName"');
    expect(html).toContain('data-catalog-availability="selected"');
  });
});

describe("CatalogPicker secondary path (ADR-0026 D7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("offers the full checklist when the primary list is thin, and picking one creates the node", async () => {
    const selections: Array<CatalogPickerSelection | null> = [];
    const asked: string[] = [];
    const renderer = await renderPicker({
      fetchRows: async () => ({ rows: [], availability: "empty" }),
      onSelectionChange: (selection) => selections.push(selection),
      fetchFullCatalogue: async () => [
        {
          colId: "6MK7J",
          displayName: "Hydrochoerus hydrochaeris",
          scientificName: "Hydrochoerus hydrochaeris (Linnaeus, 1766)",
          rank: "species",
          acceptedName: null,
        },
      ],
      materializeFromCatalogue: async (colId) => {
        asked.push(colId);
        return {
          id: "00000000-0000-4000-8000-0000000001ff",
          displayName: "Hydrochoerus hydrochaeris",
          kind: "species",
          publicPath: "/species/hydrochoerus-hydrochaeris",
        };
      },
    });

    await type(renderer, "капібара");
    const offer = renderer.root.find(
      (node) => node.props["data-catalog-full-catalogue"] === "offer",
    );
    expect(offer.props.children[0]).toBe(copy.fullCatalogue);

    await act(async () => {
      offer.props.onClick();
    });

    const checklist = renderer.root.findAll(
      (node) => node.props["data-catalog-option"] === "full_catalogue",
    );
    expect(checklist).toHaveLength(1);
    expect(checklist[0]!.props["data-catalog-col-id"]).toBe("6MK7J");

    await act(async () => {
      checklist[0]!.props.onClick();
    });

    // The pick creates the node and the picker holds an ordinary selection.
    expect(asked).toEqual(["6MK7J"]);
    expect(selections.at(-1)).toEqual({
      kind: "item",
      row: {
        id: "00000000-0000-4000-8000-0000000001ff",
        displayName: "Hydrochoerus hydrochaeris",
        kind: "species",
        publicPath: "/species/hydrochoerus-hydrochaeris",
      },
    });
  });

  it("says so when the checklist has nothing either, and keeps the own-name outcome", async () => {
    const renderer = await renderPicker({
      fetchRows: async () => ({ rows: [], availability: "empty" }),
      onSelectionChange: () => undefined,
      fetchFullCatalogue: async () => [],
      materializeFromCatalogue: async () => null,
    });

    await type(renderer, "щось своє");
    const offer = renderer.root.find(
      (node) => node.props["data-catalog-full-catalogue"] === "offer",
    );
    await act(async () => {
      offer.props.onClick();
    });

    expect(
      renderer.root.find(
        (node) => node.props["data-catalog-full-catalogue"] === "empty",
      ).props.children,
    ).toBe(copy.fullCatalogueEmpty);
    expect(
      renderer.root.findAll(
        (node) => node.props["data-catalog-option"] === "own_name",
      ),
    ).toHaveLength(1);
  });

  it("does not offer the checklist without a way to create the node", async () => {
    const renderer = await renderPicker({
      fetchRows: async () => ({ rows: [], availability: "empty" }),
      onSelectionChange: () => undefined,
    });

    await type(renderer, "томат");
    expect(
      renderer.root.findAll(
        (node) => node.props["data-catalog-full-catalogue"] === "offer",
      ),
    ).toHaveLength(0);
  });
});
