import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlantIdentificationPanel } from "./plant-identification-panel";

describe("plant identification panel", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps catalog and Unknown fallbacks available after a provider timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ state: "provider_timeout", candidates: [] }),
      ),
    );
    const renderer = await render("uk");

    await clickButton(renderer, "Визначити");

    expect(textContent(renderer.toJSON())).toContain(
      "Визначення зараз недоступне",
    );
    expect(renderer.root.findByProps({ id: "catalog-fallback-navigation" }).props.href).toBe(
      "#passport-catalog",
    );
    expect(renderer.root.findByProps({ id: "unknown-fallback-action" }).props.href).toBe(
      "#passport-catalog",
    );
    await unmount(renderer);
  });

  it("shows three explicit candidate confirmations before the user expands ranks four and five", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "00000000-0000-4000-8000-000000000301",
          state: "shortlist_ready",
          canConfirm: true,
          candidates: Array.from({ length: 5 }, (_, index) => ({
            rank: index + 1,
            score: 0.9 - index / 100,
            scientificName: `Species ${index + 1}`,
            genus: null,
            family: null,
            catalogItemId: `00000000-0000-4000-8000-00000000050${index + 1}`,
          })),
        }),
      ),
    );
    const renderer = await render("bg");

    await clickButton(renderer, "Разпознай");
    expect(buttonsWithText(renderer, "Потвърди вида")).toHaveLength(3);
    await clickButton(renderer, "Покажи още варианти");
    expect(buttonsWithText(renderer, "Потвърди вида")).toHaveLength(5);
    expect(
      renderer.root.findByProps({ "aria-expanded": true }).props.children,
    ).toBe("Покажи по-малко");
    await unmount(renderer);
  });

  it("renders explainable controls and no-photo fallbacks in every shared locale", async () => {
    for (const locale of ["uk", "bg", "ru"] as const) {
      const renderer = await render(locale, []);
      expect(renderer.root.findByProps({ id: "catalog-fallback-navigation" })).toBeDefined();
      expect(renderer.root.findByProps({ id: "unknown-fallback-action" })).toBeDefined();
      expect(textContent(renderer.toJSON())).not.toEqual("");
      await unmount(renderer);
    }
  });
});

async function render(
  locale: "uk" | "bg" | "ru",
  media = [
    {
      id: "00000000-0000-4000-8000-000000000201",
      publicUrl: "https://media.example.test/opaque.webp",
    },
  ],
) {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <PlantIdentificationPanel
        locale={locale}
        objectId="00000000-0000-4000-8000-000000000101"
        media={media}
      />,
    );
  });
  return renderer!;
}

async function clickButton(renderer: ReactTestRenderer, label: string) {
  const button = buttonsWithText(renderer, label)[0];
  expect(button).toBeDefined();
  await act(async () => {
    button?.props.onClick();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonsWithText(renderer: ReactTestRenderer, label: string) {
  return renderer.root
    .findAllByType("button")
    .filter((button) => textContent(button.props.children) === label);
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => renderer.unmount());
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "children" in value) {
    return textContent((value as { children?: unknown }).children);
  }
  if (value && typeof value === "object" && "props" in value) {
    return textContent(
      (value as { props: { children?: unknown } }).props.children,
    );
  }
  return "";
}
