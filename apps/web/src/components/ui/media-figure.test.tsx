// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MediaFigure } from "./media-figure";

vi.mock("@/components/media/subject-aware-media-image", () => ({
  SubjectAwareMediaImage: ({
    alt,
    src,
    srcSet,
    presentationMode,
    fill,
    width,
    height,
  }: {
    alt: string;
    src: string;
    srcSet?: string;
    presentationMode: string;
    fill?: boolean;
    width?: number;
    height?: number;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      src={src}
      srcSet={srcSet}
      width={width}
      height={height}
      data-presentation={presentationMode}
      data-fill={fill ? "true" : "false"}
    />
  ),
}));

const photograph = {
  src: "https://media.over.garden/derivatives/one/1.webp",
  srcSet: "https://media.over.garden/derivatives/one/1-480.webp 480w",
  alt: "Грядка з томатами у вечірньому світлі",
};

describe("MediaFigure", () => {
  it("is a figure whose image a reader can find by its real sentence", () => {
    render(<MediaFigure {...photograph} />);

    const image = screen.getByRole("img", { name: photograph.alt });
    expect(image.getAttribute("srcset")).toBe(photograph.srcSet);
    // ADR-0022 D2: the bytes are final, so no optimizer sits in the URL.
    expect(image.getAttribute("src")).not.toContain("/_next/image");
  });

  it("associates the caption with the image through figcaption", () => {
    const { container } = render(
      <MediaFigure {...photograph} caption="Третій тиждень після висадки" />,
    );

    const caption = container.querySelector("figcaption");
    expect(caption?.textContent).toBe("Третій тиждень після висадки");
    // A caption rendered as a sibling paragraph is associated with nothing.
    expect(caption?.closest("figure")).toBeTruthy();
  });

  it("reserves a 16:9 box for a cover and a 4:3 box for a card", () => {
    const { container: cover } = render(<MediaFigure {...photograph} />);
    expect(cover.querySelector(".aspect-cover")).toBeTruthy();
    expect(
      cover.querySelector("img")?.getAttribute("data-presentation"),
    ).toBe("cover");

    const { container: card } = render(
      <MediaFigure {...photograph} aspect="card" />,
    );
    expect(card.querySelector(".aspect-card")).toBeTruthy();
  });

  it("keeps a photograph in prose at its own ratio, reserved by its size", () => {
    const { container } = render(
      <MediaFigure
        {...photograph}
        aspect="auto"
        intrinsicWidth={1600}
        intrinsicHeight={1200}
      />,
    );

    // Cropping a gardener's photograph to a tidy number is the thing this
    // branch exists to avoid; the box is reserved by width and height instead.
    expect(container.querySelector(".aspect-cover")).toBeNull();
    expect(container.querySelector(".aspect-card")).toBeNull();
    const image = container.querySelector("img");
    expect(image?.getAttribute("data-presentation")).toBe("contain");
    expect(image?.getAttribute("width")).toBe("1600");
    expect(image?.getAttribute("height")).toBe("1200");
  });
});
