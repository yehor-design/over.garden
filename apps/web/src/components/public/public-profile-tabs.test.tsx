// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PublicProfileTabs } from "./public-profile-tabs";

const TABS = [
  { id: "entries", label: "Записи", content: <p>entries</p> },
  { id: "objects", label: "Об’єкти", content: <p>objects</p> },
];

describe("PublicProfileTabs (OVE-494)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("names, in the address, the page each list was drawn at", async () => {
    // Page two of the entries, with a resumed sign-in intent beside it.
    window.history.replaceState(null, "", "/@olena?page=2&authIntent=follow");
    render(
      <PublicProfileTabs
        label="Розділи профілю"
        tabs={TABS}
        selectedId="entries"
        pageByTab={{ entries: 2, objects: 1 }}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Об’єкти" }));
    // The objects panel is its first page, so the page number goes.
    expect(window.location.search).toBe("?authIntent=follow&tab=objects");

    await userEvent.click(screen.getByRole("tab", { name: "Записи" }));
    // Back on the entries, which are still page two: a reload shows the
    // same list the reader is looking at.
    expect(window.location.search).toBe("?authIntent=follow&page=2");
  });
});
