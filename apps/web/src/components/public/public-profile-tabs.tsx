"use client";

import { useState } from "react";

import { Tabs, type TabModel } from "@/components/ui/tabs";

/**
 * The profile's tabs, with the selected one in the URL.
 *
 * `Tabs` is the keyboard behaviour — one tab in the tab order, arrows to move,
 * `Home` and `End` to the ends. This is the address: the selected tab is
 * `?tab=…`, so a reader can share the view they are looking at and get it back
 * after a reload, which is the same rule the filters follow (ADR-0031 D6).
 *
 * `replace` rather than `push`: a tab is a view of one page, not a page of its
 * own, and filling the Back button with tab changes would make Back stop
 * meaning "the page I came from".
 *
 * **The address is written with `history.replaceState`, not the router.** The
 * profile is a static document (ADR-0032) and a `?tab=` address renders from
 * its `/q` twin, which is another route tree: a router navigation to it
 * re-mounted the whole page under the keyboard and focus fell to `<body>`
 * mid-arrow-key. Nothing needs fetching anyway — every panel is already here —
 * and Next's router adopts a native `replaceState` as its own address.
 *
 * Every panel is rendered whichever tab is selected — `Tabs` hides the others
 * rather than dropping them — so a crawler still reads a profile's entries and
 * objects whatever `?tab=` says, and the server decides the initial selection
 * so the first paint is already right.
 *
 * **The selection is held here, not read back from the URL.** The obvious
 * shape — pass `?tab=` straight into `Tabs` and let the router be the state —
 * was measured in a browser and is wrong: `router.replace` changes the address
 * immediately, but this route's search parameters are read on the server, so
 * the new selection does not come back for a frame or more. In between, an
 * arrow key moved focus to a tab that stayed `aria-selected="false"` — a
 * keyboard user pressing → and watching nothing open. So the press is applied
 * at once and the URL is written beside it; a `selectedId` that changes
 * underneath (a shared link, a restored history entry) is adopted.
 */
export function PublicProfileTabs({
  label,
  tabs,
  selectedId,
  parameter = "tab",
  pageByTab,
}: {
  label: string;
  tabs: readonly TabModel[];
  selectedId: string;
  parameter?: string;
  /** The page each tab's list was drawn at; absent means the first. */
  pageByTab?: Readonly<Record<string, number>>;
}) {
  const [selected, setSelected] = useState(selectedId);
  const [fromServer, setFromServer] = useState(selectedId);

  // Adjusting state during render, which is React's own answer to "a prop
  // changed and derived state must follow" — no effect, no extra paint.
  if (selectedId !== fromServer) {
    setFromServer(selectedId);
    setSelected(selectedId);
  }

  return (
    <Tabs
      label={label}
      tabs={tabs}
      selectedId={selected}
      data-profile-tab={selected}
      onSelect={(id) => {
        setSelected(id);
        // Read the address only in response to a press. Reading router search
        // state during render would postpone the entire static profile.
        const pathname = window.location.pathname;
        const next = new URLSearchParams(window.location.search);
        // The first tab is the page itself, so it is absent rather than
        // written: absent means unset, here as everywhere else.
        if (id === tabs[0]?.id) next.delete(parameter);
        else next.set(parameter, id);
        // A page number belongs to the list it paged (`OVE-494`): the address
        // names the page of the list the reader is now looking at, which is
        // the page that panel was drawn at — so a reload shows the same list.
        next.delete("page");
        const page = pageByTab?.[id] ?? 1;
        if (page > 1) next.set("page", String(page));
        const query = next.toString();
        window.history.replaceState(
          null,
          "",
          `${query ? `${pathname}?${query}` : pathname}${window.location.hash}`,
        );
      }}
    />
  );
}
