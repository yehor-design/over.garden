import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DESTINATION_COPY } from "@/lib/garden/owned-destinations";

import { OwnedDestinationPicker } from "./owned-destination-picker";

const copy = DESTINATION_COPY.uk;

/** Every string under a node, in order, the way a reader's eye takes it. */
function textOf(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

/** The one button that makes a new plant or animal, found by its data hook. */
function createAction(renderer: ReactTestRenderer) {
  return renderer.root.find(
    (node) =>
      node.type === "button" &&
      node.props["data-owned-destination-create"] === "true",
  );
}

describe("the owned-destination picker's create action (OVE-478)", () => {
  beforeEach(() => {
    // An empty garden page for every search: the create action does not
    // depend on what the search finds.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ items: [], recent: [], nextCursor: null }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is offered beside the search, named for what was typed, and never replaces a result", async () => {
    const onCreate = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <OwnedDestinationPicker
          locale="uk"
          selection={null}
          onSelect={() => undefined}
          onCreate={onCreate}
        />,
      );
    });
    // Nothing typed: the plain action.
    expect(textOf(createAction(renderer))).toBe(copy.createNew);

    const input = renderer.root.find(
      (node) => node.type === "input" && node.props.role === "combobox",
    );
    await act(async () => {
      input.props.onChange({ target: { value: "  Томат черрі " } });
    });
    const named = createAction(renderer);
    expect(textOf(named)).toBe(
      copy.createNamed.replace("{name}", "Томат черрі"),
    );
    // It does not act by itself: only a press creates, with the trimmed name.
    expect(onCreate).not.toHaveBeenCalled();
    await act(async () => named.props.onClick());
    expect(onCreate).toHaveBeenCalledWith("Томат черрі");
    await act(async () => renderer.unmount());
  });

  it("is not offered where only a space can be chosen, or when the caller cannot create", () => {
    for (const html of [
      renderToStaticMarkup(
        <OwnedDestinationPicker
          locale="uk"
          selection={null}
          onSelect={() => undefined}
          onCreate={() => undefined}
          kind="space"
        />,
      ),
      renderToStaticMarkup(
        <OwnedDestinationPicker
          locale="uk"
          selection={null}
          onSelect={() => undefined}
        />,
      ),
    ]) {
      expect(html).not.toContain("data-owned-destination-create");
    }
  });

  it("names the action in every language", () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const html = renderToStaticMarkup(
        <OwnedDestinationPicker
          locale={locale}
          selection={null}
          onSelect={() => undefined}
          onCreate={() => undefined}
        />,
      );
      expect(html).toContain(DESTINATION_COPY[locale].createNew);
      expect(DESTINATION_COPY[locale].createNamed).toContain("{name}");
    }
  });
});
