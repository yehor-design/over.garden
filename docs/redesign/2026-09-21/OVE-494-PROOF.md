# Public profiles — OVE-494

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- **Who the gardener is, compactly** (criterion 1). `ProfileHeader` is now
  Threads' identity block:
  - the name as the page's one `h1`, with no "Профіль садівника" overline
    above it;
  - the handle, with the picture beside the name (initials when there is
    none, hidden from assistive technology);
  - the bio, whole, in the gardener's own line breaks (up to the 600
    characters the column allows);
  - region and languages, in the reader's language. The region used the
    English "Bulgaria - Varna Province"; it is now
    `getLocalizedCoarseRegionLabel`, and a city is still narrowed to its
    country;
  - followers and following as words ("12 підписників").

  A gardener with no display name shows their handle, which is one long word,
  so the name and the handle wrap anywhere instead of widening the page at
  320 px. Before this, the empty profile scrolled sideways to 393 px.
- **Two views, in the product's vocabulary** (criteria 1 and 5). The tabs are
  **Записи** and **Об'єкти** (BG Записи/Обекти, RU Записи/Объекты), in that
  order, each with its count.
  - **Entries** are every public observation — about one object or about a
    whole space — drawn with the feed's own card. `PublicFeedEntryCard` moved
    to `components/public/public-feed-entry-card.tsx`, and the feed, `/feed`
    and the profile all import it. An entry about a space names the space
    ("Простір · Балкон") with no link, because a space has no public address.
  - **Objects** are journals. Each card says "Журнал: 5 записів · Останній
    запис 1 вер. 2026 р.", so a history can be told from an observation before
    either is opened (OG-UX-010). An object without a photograph is words and
    a small mark of its kind, not a grey box standing in for a picture.
  - The "about" tab is gone; its facts are the header. A link that still says
    `?tab=about` loses the parameter at the proxy and is served the static
    entries document.
- **Every entry and every object is reachable** (criterion 4). The profile
  used to stop at 16 entries and 12 objects, with "Показати ще 8+" and no way
  past them. Now:
  - both lists page: ten entries or twelve objects to a page, as real
    `Pagination` links (`?page=`, `?tab=objects&page=`), with "Сторінка 2 з 3";
  - `page` is on the route policy and the `/q` twin's keys;
  - later pages are `noindex, follow` from the proxy, as `/journals` is, and
    the canonical stays the profile's first page;
  - a page past the end is a 404 from the proxy
    (`isPublicProfilePageBeyondTheEnd`), not a 200 with an empty panel;
  - switching tabs writes each panel's own page into the address, so a reload
    shows the list the reader was looking at;
  - the object covers are ranked per object. The old read took the newest 96
    photographs of the whole profile, so one busy object could leave the rest
    of the page without covers.
- **One action, and no settings on the page** (criterion 2). The owner sees
  "Редагувати профіль" (a link to the private editor). Another member sees
  follow and a menu with report and block; a guest sees follow through sign-in.
  No settings or security field is part of the public page.
- **Nothing that names how the page is built** (criteria 3 and 5).
  - Removed: the lineage count ("Підтверджені походження"), the context rail
    (which repeated the tabs and linked the owner's claim queue), the
    "Лічильники підписок приховані." notice, and the English region label.
  - A zero or hidden count is simply absent, and so is a tab's count when it
    is zero. An empty profile shows one "no results" sentence, with no picture
    and no invitation to a visitor.
  - The shared card now names an object's region in the reader's language
    ("Україна — місто Київ") instead of its code ("Регіон UA-30"), on the feed
    as on the profile.
- **Only the open panel's first photograph is preloaded.** The hidden panel's
  first photograph no longer competes for the first screen.
- **The feed's media and topic reads** accept entries about a space when a
  caller asks, and now apply the launch-content policy themselves. The profile
  was the one reader whose photographs came through a read with that policy;
  keeping it there closes the gap its removal would have opened.
- **The twin is chosen from what survives the policy.** A parameter the page
  never reads (`?tab=about`, `?page=abc`) no longer sends the reader to the
  streamed `/q` twin, which needs a script to reveal. This applies to the
  unprefixed and the prefixed address.

## Proof

`tests/public-profile-pages.spec.ts` (new, registered in the gate), against
`next start` and the local database. The fixture is a gardener with:
- a 560-character, two-paragraph bio and a region;
- 14 objects and 23 entries (two about the whole space), published a minute
  apart;
- a second member with nothing published;
- sessions for both.

1. **A guest, 1440:**
   - one `h1` and the bio byte for byte;
   - region "Україна — Хмельницька область" and "Українська · Български";
   - no count, not a zero;
   - tabs "Записи 23" / "Об'єкти 14";
   - page 1 is the ten newest in order, as the feed's card;
   - "Старіші" loads page 2: `200`, `X-Robots-Tag: noindex, follow`,
     canonical the bare profile;
   - page 3 holds the last three, with "Старіші" disabled;
   - `?page=4` answers **404**.
2. **Objects:**
   - from `?page=2`, the Objects tab writes `?tab=objects` and back writes
     `?page=2`;
   - twelve journals, newest first, "Журнал: 8 записів" / "Журнал: 1 запис";
   - "Наступні" gives the last two, fourteen distinct in all;
   - an object's card opens its passport (`200`).
3. **No script:**
   - the static document shows the name and the ten newest entries;
   - its bytes hold all twelve objects of the hidden panel, the
     `?page=2` link and the guest's `/auth/intent/start` follow;
   - the `?tab=objects` twin's bytes carry `data-profile-tab="objects"` and
     every object;
   - `?tab=about` is the static entries, readable.
4. **The owner, another member and a guest** (1440 and 390):
   - the owner sees the edit link to `/garden/profile#public-profile-editor`
     and no follow;
   - the member sees "Стежити, Оксана · сад над Дністром" and the menu;
   - the guest sees follow;
   - none sees an editable handle, display name, bio or relationship setting;
   - no sideways scroll.
5. **Keyboard:** follow → the menu → the selected tab → the panel → the first
   card's link. → moves to Об'єкти and selects it; Tab enters the objects.
6. **An empty profile, 320:**
   - "Опублікованих записів ще немає." in the no-results state;
   - no counts, and no digits in the tabs;
   - initials with no image;
   - no sideways scroll; axe clean.
7. **320:** the long bio wraps; no sideways scroll; axe clean on the entries
   and the objects view.
8. **BG and RU:**
   - their own tab names, "Страница 1 от 3" / "Страница 1 из 3" and region
     names;
   - page links keep the prefix;
   - `/uk/@…?page=2` folds to `/@…?page=2` with `308`.

`tests/public-profile.spec.ts` was updated to the two tabs (arrows, Home and
End, `?tab=objects` reloads open), and still proves:
- axe on a full profile, an empty one and both passports;
- a rename's 308 for a passport and 410 for the old profile;
- follow with no client bundle;
- the passport's lineage forms as real endpoints.

The whole local gate on the final build: 271 passed and 1 skipped. Its one
failure was `object-setup.spec.ts` stopped by Better Auth's sign-up rate limit
(429 four times). Rerun alone, it passed 5/5.

Unit:
- `public-profile.test.tsx` (12) — the view;
- `profile-header.test.tsx` (6);
- `public-profile-copy.test.ts` — vocabulary, plurals, and no implementation
  words;
- `public-profile-tabs.test.ts` and `public-profile-tabs.test.tsx` — the page
  a tab writes;
- `public-profile-repository.test.ts` — the entry page query, per-object
  covers, the card shape, pages;
- the route and twin tests;
- `interface-route-policy`, `public-query-twin` and `public-listing-pagination`
  for `page`;
- `proxy.test.ts` — the twin, the robots header, the 404 past the end, and the
  static document for a dropped parameter.

### Screenshots (`docs/redesign/2026-09-21/ove-494/`)

- guest: `profile-guest-1440`, `profile-guest-390`, `profile-guest-320`;
- self: `profile-self-1440`, `profile-self-390`;
- another member: `profile-member-1440`, `profile-member-390`;
- empty: `profile-empty-320`.

## Not claimed

- **Separating the profile editor from account and security settings**
  (OVE-503). The public page only links to the editor.
- **A communities tab.** Memberships have no visibility setting, which is
  still an owner decision (see `lib/public-profile-tabs.ts`).
- **A real screen-reader session** (OVE-478).
