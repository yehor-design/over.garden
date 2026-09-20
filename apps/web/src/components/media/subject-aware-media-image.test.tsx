import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SubjectAwareMediaImage } from "./subject-aware-media-image";

const photograph = {
  presentationMode: "cover",
  src: "https://media.over.garden/derivatives/one/1.webp",
  alt: "Грядка з томатами у вечірньому світлі",
  width: 1200,
  height: 900,
} as const;

/** One attribute of the one `<img>` the component renders. */
function attribute(html: string, name: string) {
  return new RegExp(`\\s${name}="([^"]*)"`, "iu").exec(html)?.[1] ?? null;
}

describe("which photograph a page asks for first (OVE-470)", () => {
  it("asks for the page's first photograph at once, ahead of everything else", () => {
    const html = renderToStaticMarkup(
      <SubjectAwareMediaImage {...photograph} priority />,
    );

    expect(attribute(html, "loading")).toBe("eager");
    expect(attribute(html, "fetchPriority")).toBe("high");
  });

  it("leaves every other photograph lazy, and its priority to the browser", () => {
    // Not `fetchpriority="low"`, which was tried and measured. Production's
    // waterfall (2026-09-20) shows Chrome already asking for a lazy image
    // outside the viewport at its lowest priority, so the attribute changes
    // nothing there; what it does change is an image *inside* the viewport that
    // nobody marked `priority`, which the browser would have raised by itself —
    // the one rescue a page with an unmarked LCP has.
    const html = renderToStaticMarkup(
      <SubjectAwareMediaImage {...photograph} />,
    );

    expect(attribute(html, "loading")).toBe("lazy");
    expect(attribute(html, "fetchPriority")).toBeNull();
  });

  it("lets a caller that knows better say so", () => {
    const html = renderToStaticMarkup(
      <SubjectAwareMediaImage
        {...photograph}
        loading="eager"
        fetchPriority="auto"
      />,
    );

    expect(attribute(html, "loading")).toBe("eager");
    expect(attribute(html, "fetchPriority")).toBe("auto");
  });
});
