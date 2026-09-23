// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentLink, Link } from "./link";

describe("Link", () => {
  it("renders a real anchor with its href", () => {
    render(<Link href="/journals">Усі журнали</Link>);
    const link = screen.getByRole("link", { name: "Усі журнали" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/journals");
  });

  it("is in the tab order and takes focus", () => {
    render(<Link href="/journals">Усі журнали</Link>);
    const link = screen.getByRole("link", { name: "Усі журнали" });
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("underlines an inline link at rest, because colour is never the only signal", () => {
    const { rerender } = render(<Link href="/journals">Усі журнали</Link>);
    expect(screen.getByRole("link").className).toContain("underline");
    rerender(
      <Link href="/journals" variant="quiet">
        Усі журнали
      </Link>,
    );
    expect(screen.getByRole("link").className).toContain("hover:underline");
  });

  it("spreads the props that decide navigation onto the anchor", () => {
    render(
      <Link href="https://over.garden" prefetch={false} data-probe="yes">
        OverGarden
      </Link>,
    );
    expect(screen.getByRole("link").getAttribute("data-probe")).toBe("yes");
  });
});

describe("DocumentLink", () => {
  it("is the same link to a reader, with nothing of the client router on it", () => {
    // `OVE-496`: from the catalogue's static door into its query twin, a
    // client navigation changed the URL over the same page. A plain anchor is
    // the browser's own navigation, which asks the server.
    render(
      <DocumentLink
        href="/catalog?letter=s"
        variant="quiet"
        aria-current="true"
      >
        S
      </DocumentLink>,
    );
    const link = screen.getByRole("link", { name: "S" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/catalog?letter=s");
    expect(link.getAttribute("aria-current")).toBe("true");
    expect(link.getAttribute("data-slot")).toBe("link");
    expect(link.className).toContain("hover:underline");
    link.focus();
    expect(document.activeElement).toBe(link);
  });
});
