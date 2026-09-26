// @vitest-environment jsdom
/* eslint-disable @next/next/no-html-link-for-pages --
   The guard watches the DOM, not React: what it must intercept is an anchor in
   the document, which is what `next/link` renders. A raw `<a>` is the honest
   fixture, and a `Link` here would only add a router context to assert the
   same element. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import {
  shouldGuardNavigation,
  UnpublishedWorkGuard,
  type UnpublishedWorkGuardCopy,
} from "./unpublished-work-guard";

const copy: UnpublishedWorkGuardCopy = {
  leaveTitle: "Піти без публікації?",
  leaveDescription: "Цей запис ще ніде не збережений.",
  leaveConfirm: "Піти й відкинути",
  leaveCancel: "Залишитися",
};

function anchor(attributes: Record<string, string>) {
  const element = document.createElement("a");
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  document.body.append(element);
  return element;
}

const here = { pathname: "/garden", search: "" };

describe("shouldGuardNavigation", () => {
  it("guards a same-origin link that leads somewhere else", () => {
    expect(shouldGuardNavigation(anchor({ href: "/catalog" }), here)).toBe(true);
    expect(
      shouldGuardNavigation(anchor({ href: "/garden?tab=spaces" }), here),
    ).toBe(true);
  });

  it("lets the page's own anchors and new tabs through", () => {
    // The same page with a hash is not leaving it.
    expect(
      shouldGuardNavigation(anchor({ href: "#follow-up-composer" }), here),
    ).toBe(false);
    expect(shouldGuardNavigation(anchor({ href: "/garden" }), here)).toBe(false);
    expect(
      shouldGuardNavigation(
        anchor({ href: "/terms", target: "_blank" }),
        here,
      ),
    ).toBe(false);
    expect(
      shouldGuardNavigation(
        anchor({ href: "/export.csv", download: "export.csv" }),
        here,
      ),
    ).toBe(false);
    expect(
      shouldGuardNavigation(anchor({ href: "https://example.org/" }), here),
    ).toBe(false);
    // A link the gardener wrote into the entry is part of the document.
    const canvas = document.createElement("div");
    canvas.setAttribute("contenteditable", "true");
    const written = document.createElement("a");
    written.setAttribute("href", "/catalog");
    canvas.append(written);
    document.body.append(canvas);
    expect(shouldGuardNavigation(written, here)).toBe(false);
  });
});

describe("UnpublishedWorkGuard", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    document.body.replaceChildren();
  });

  it("stops the navigation and names what is lost", async () => {
    const user = userEvent.setup();
    render(
      <>
        <a href="/catalog">Каталог</a>
        <UnpublishedWorkGuard active copy={copy} />
      </>,
    );

    await user.click(screen.getByRole("link", { name: "Каталог" }));

    expect(screen.getByText(copy.leaveTitle)).toBeTruthy();
    expect(screen.getByText(copy.leaveDescription)).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("re-issues the navigation the reader pressed, and warns once", async () => {
    const user = userEvent.setup();
    render(
      <>
        <a href="/catalog">Каталог</a>
        <UnpublishedWorkGuard active copy={copy} />
      </>,
    );

    await user.click(screen.getByRole("link", { name: "Каталог" }));
    await user.click(screen.getByRole("button", { name: copy.leaveConfirm }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(String(mocks.push.mock.calls[0]?.[0])).toContain("/catalog");

    // Warned once: a second press is no longer interrupted.
    await user.click(screen.getByRole("link", { name: "Каталог" }));
    expect(screen.queryByText(copy.leaveTitle)).toBeNull();
  });

  it("keeps the reader where they are when they cancel", async () => {
    const user = userEvent.setup();
    render(
      <>
        <a href="/catalog">Каталог</a>
        <UnpublishedWorkGuard active copy={copy} />
      </>,
    );

    await user.click(screen.getByRole("link", { name: "Каталог" }));
    await user.click(screen.getByRole("button", { name: copy.leaveCancel }));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByText(copy.leaveTitle)).toBeNull();
  });

  it("does nothing at all when there is nothing to lose", async () => {
    const user = userEvent.setup();
    render(
      <>
        <a href="/catalog">Каталог</a>
        <UnpublishedWorkGuard active={false} copy={copy} />
      </>,
    );

    await user.click(screen.getByRole("link", { name: "Каталог" }));
    expect(screen.queryByText(copy.leaveTitle)).toBeNull();
  });
});
