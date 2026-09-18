"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
}: {
  label: string;
  tabs: readonly TabModel[];
  selectedId: string;
  parameter?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
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
        const next = new URLSearchParams(search.toString());
        // The first tab is the page itself, so it is absent rather than
        // written: absent means unset, here as everywhere else.
        if (id === tabs[0]?.id) next.delete(parameter);
        else next.set(parameter, id);
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      }}
    />
  );
}
