import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeartIcon, MagnifyingGlassIcon } from "./index";

describe("Phosphor interface icons", () => {
  it("renders on the server with an explicit decorative contract and size tokens", () => {
    for (const [size, token] of [
      [16, "sm"],
      [20, "md"],
      [24, "lg"],
    ] as const) {
      const html = renderToStaticMarkup(<MagnifyingGlassIcon size={size} />);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('focusable="false"');
      // A pixel value every engine parses, and the token for the CSS
      // (`globals.css`): `var()` in an SVG attribute is not parsed everywhere.
      expect(html).toContain(`width="${size}"`);
      expect(html).toContain(`height="${size}"`);
      expect(html).toContain(`data-og-icon-size="${token}"`);
      expect(html).not.toContain("var(--size-icon");
      expect(html).toContain('data-og-icon="phosphor"');
      expect(html).not.toContain("<title>");
    }
  });
  it("uses the same glyph's fill variation for selection", () => {
    const normal = renderToStaticMarkup(<HeartIcon />);
    const selected = renderToStaticMarkup(<HeartIcon selected />);
    expect(selected).not.toBe(normal);
    expect(selected).toContain('aria-hidden="true"');
  });
});
