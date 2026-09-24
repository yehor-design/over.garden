import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import type { OwnedDestination } from "@/lib/garden/owned-destinations";
import {
  getEntryComposerCopy,
  localCalendarDate,
} from "@/lib/entry-composer-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

import {
  communityContributeHref,
  EntryComposer,
  type EntryComposerCommunity,
} from "./entry-composer";

const beehive: OwnedDestination = {
  kind: "object",
  id: "18700003-0000-4000-8000-000000000001",
  displayName: "Apis mellifera — Кошер № 7",
  objectKind: "animal",
  parent: { id: "18700003-0000-4000-8000-000000000009", displayName: "Пасіка" },
  species: "Apis mellifera",
};

const balcony: OwnedDestination = {
  kind: "space",
  id: "18700003-0000-4000-8000-000000000010",
  displayName: "Балкон",
};

// Opened from a community's "Write for this community" (`OVE-500`).
const community: EntryComposerCommunity = {
  name: "Спостереження і догляд",
  returnPath: "/bg/communities/observation-and-care",
  accepting: true,
  member: true,
};

const localeExpectations = [
  [
    "uk",
    {
      whatChanged: "Що змінилося?",
      publish: "Опублікувати",
      moreDetails: "Більше деталей",
      choosePhoto: "Обрати фото",
      date: "Дата спостереження",
      writingTo: "Запис у",
    },
  ],
  [
    "bg",
    {
      whatChanged: "Какво се промени?",
      publish: "Публикувай",
      moreDetails: "Повече подробности",
      choosePhoto: "Избор на снимка",
      date: "Дата на наблюдението",
      writingTo: "Запис в",
    },
  ],
  [
    "ru",
    {
      whatChanged: "Что изменилось?",
      publish: "Опубликовать",
      moreDetails: "Больше подробностей",
      choosePhoto: "Выбрать фото",
      date: "Дата наблюдения",
      writingTo: "Запись в",
    },
  ],
] as const satisfies readonly [InterfaceLocale, Record<string, string>][];

describe("the one entry composer (OVE-486)", () => {
  it("fences every control behind the local-only atomic composer state", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./entry-composer.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("useLocalJournalComposer({");
    expect(source).toContain('imageInsertionMode="immediate"');
    expect(source).toContain("LocalJournalPublicationDisclosure");
    expect(source).toContain(
      '<fieldset disabled={persistenceFrozen} className="contents">',
    );
    expect(source).not.toMatch(
      /navigator\.onLine|["']online["']\s*,\s*handle|@\/lib\/offline|indexedDB|localStorage/u,
    );
    expect(source).not.toMatch(
      /use-online-journal-composer|online-journal-submit|use-inline-media-selection|createComposerPhotoIntent/u,
    );
  });

  it.each(localeExpectations)(
    "names the destination, the date and public visibility first in %s",
    (locale, expected) => {
      const html = renderToStaticMarkup(
        <EntryComposer
          locale={locale}
          initialDestination={beehive}
          today="2026-07-16"
          requiresFirstPublicationDisclosure
        />,
      );
      // Where, when and who can see it, before the text.
      const destinationAt = html.indexOf(
        'data-entry-composer-destination="true"',
      );
      expect(destinationAt).toBeGreaterThan(-1);
      expect(destinationAt).toBeLessThan(html.indexOf(expected.whatChanged));
      expect(html).toContain(expected.writingTo);
      expect(html).toContain(beehive.displayName);
      expect(html).toContain(expected.date);
      expect(html).toContain('data-entry-composer-visibility="public"');
      expect(html).toContain('value="2026-07-16"');
      expect(html).toContain(expected.publish);
      expect(html).toContain(expected.moreDetails);
      // Text first (`OVE-487`): photographs are added inside the story from
      // the composer's own tool row, and the cover is not a question until
      // there is a photograph to choose — no separate photo section and no
      // cover section on an empty note.
      expect(html).not.toContain(expected.choosePhoto);
      expect(html).not.toContain("data-photo-picker-control");
      expect(html).not.toContain("data-journal-cover-controls");
      // A contextual launch does not ask where again.
      expect(html).not.toContain("data-owned-destination-picker");
      expect(html).not.toMatch(
        /Saved follow-ups on this device|на цьому пристрої|на това устройство|на этом устройстве|queued|syncing|autosave|чернетк/i,
      );
    },
  );

  it("offers a new plant or animal beside the picker, and publishes it with its first entry in one transaction (OVE-478)", async () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={null}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain('data-owned-destination-create="true"');
    expect(html).toContain("Нова рослина чи тварина");

    // The request the new-object mode sends is the atomic first entry: the
    // object (and a named new space) exist only together with this entry.
    const source = await readFile(
      fileURLToPath(new URL("./entry-composer.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain('target: "first_plant_entry"');
    expect(source).toContain("onCreate={startNewObject}");
    expect(source).toMatch(
      /newObject && result\.plantObjectId\s*\?\s*`\/garden\/objects\/\$\{encodeURIComponent\(result\.plantObjectId\)\}`/u,
    );
    for (const locale of ["uk", "bg", "ru"] as const) {
      const copy = getEntryComposerCopy(locale).newObject;
      for (const text of Object.values(copy)) expect(text).not.toBe("");
    }
  });

  it("opens the owned-destination picker at once when launched with nothing chosen", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={null}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain("data-owned-destination-picker");
    expect(html).toContain("Куди записати?");
  });

  // A reminder opened after its plant was deleted, or a link whose place could
  // not be read (`OVE-501`): the picker opens as before, and now says why.
  it.each(["object", "space", "unavailable"] as const)(
    "says why the destination a link named is not chosen (%s), above the picker",
    (notice) => {
      const copy = getEntryComposerCopy("uk");
      const html = renderToStaticMarkup(
        <EntryComposer
          locale="uk"
          initialDestination={null}
          today="2026-07-16"
          requiresFirstPublicationDisclosure={false}
          destinationNotice={notice}
        />,
      );
      const at = html.indexOf(
        `data-entry-composer-destination-notice="${notice}"`,
      );

      expect(at).toBeGreaterThan(-1);
      expect(html).toContain(copy.destinationNotice[notice]);
      expect(at).toBeLessThan(html.indexOf("data-owned-destination-picker"));
    },
  );

  it("says nothing about the link once a destination is chosen", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={beehive}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
        destinationNotice="object"
      />,
    );

    expect(html).not.toContain("data-entry-composer-destination-notice");
    expect(html).toContain(beehive.displayName);
  });

  it("asks a space entry which of the space's objects it mentions", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={balcony}
        initialSpaceObjects={[
          { id: "18700003-0000-4000-8000-000000000011", displayName: "Томат" },
          {
            id: "18700003-0000-4000-8000-000000000012",
            displayName: "Базилік",
          },
        ]}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain('data-entry-composer-mentions="true"');
    expect(html).toContain("Про кого цей запис?");
    expect(html).toContain("Томат");
    expect(html).toContain("Базилік");
    expect(html).toContain("Що відбувається в цьому просторі?");
  });

  it("says so, and offers to add one, when a space has no objects to mention", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={balcony}
        initialSpaceObjects={[]}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain('data-entry-composer-space-empty="true"');
    expect(html).toContain(`/garden/objects/new?space=${balcony.id}`);
  });

  it("does not repeat first-publication consent after the owner has disclosed", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={beehive}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).not.toContain("Я розумію, що цей запис");
  });

  it.each(["uk", "bg", "ru"] as const)(
    "names the community an entry is written for, and asks for a plant or an animal, in %s (OVE-500)",
    (locale) => {
      const copy = getEntryComposerCopy(locale);
      const html = renderToStaticMarkup(
        <EntryComposer
          locale={locale}
          initialDestination={null}
          today="2026-07-16"
          requiresFirstPublicationDisclosure={false}
          community={community}
        />,
      );
      const notice = html.indexOf('data-entry-composer-community="accepting"');
      expect(notice).toBeGreaterThan(-1);
      // Which community, and what happens after Publish, before where.
      expect(notice).toBeLessThan(
        html.indexOf('data-entry-composer-destination="true"'),
      );
      expect(html).toContain(copy.community.title(community.name));
      expect(html).toContain(copy.community.body);
      // A member is not told to join.
      expect(html).not.toContain(copy.community.notMember);
      // A community takes entries about one plant or animal: the picker
      // offers objects, not the spaces that hold them.
      expect(html).toContain('data-owned-destination-picker="object"');
    },
  );

  it("tells a writer who is not a member yet that the community will ask them to join", () => {
    const copy = getEntryComposerCopy("uk");
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={null}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
        community={{ ...community, member: false }}
      />,
    );
    expect(html).toContain('data-entry-composer-community="accepting"');
    expect(html).toContain(copy.community.body);
    expect(html).toContain(copy.community.notMember);
  });

  it("does not start a community entry in a space the address named, but keeps an object", () => {
    const fromSpace = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={balcony}
        initialSpaceObjects={[]}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
        community={community}
      />,
    );
    // The space is set aside and the question is asked again, among objects.
    expect(fromSpace).toContain('data-owned-destination-picker="object"');
    expect(fromSpace).not.toContain("data-entry-composer-destination-name");
    expect(fromSpace).not.toContain(balcony.displayName);
    expect(fromSpace).not.toContain("data-entry-composer-space-empty");
    expect(fromSpace).not.toContain("data-entry-composer-mentions");

    const fromObject = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={beehive}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
        community={community}
      />,
    );
    // An object is what a community takes: it is kept, and not asked again.
    expect(fromObject).toContain("data-entry-composer-destination-name");
    expect(fromObject).toContain(beehive.displayName);
    expect(fromObject).not.toContain("data-owned-destination-picker");
  });

  it("says a closed community takes nothing now, and leaves the entry's destination alone", () => {
    const copy = getEntryComposerCopy("uk");
    const closed = { ...community, accepting: false };
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={null}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
        community={closed}
      />,
    );
    expect(html).toContain('data-entry-composer-community="closed"');
    expect(html).toContain(copy.community.closed(community.name));
    expect(html).not.toContain(copy.community.title(community.name));
    expect(html).not.toContain(copy.community.body);
    // The entry is published to the writer's own journal only, anywhere they
    // choose: nothing is narrowed for a community that will not take it.
    expect(html).toContain('data-owned-destination-picker="all"');

    const inSpace = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={balcony}
        initialSpaceObjects={[]}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
        community={closed}
      />,
    );
    expect(inSpace).toContain(balcony.displayName);
    expect(inSpace).toContain('data-entry-composer-space-empty="true"');
  });

  it("names no community and narrows nothing when it was not opened from one", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={null}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).not.toContain("data-entry-composer-community");
    expect(html).toContain('data-owned-destination-picker="all"');
  });

  it("returns a community writer to the community's contribution step, the new entry first", () => {
    const entryId = "18700003-0000-4000-8000-0000000000e1";
    expect(communityContributeHref(community.returnPath, entryId)).toBe(
      `/bg/communities/observation-and-care?contribute=${entryId}#community-contribute`,
    );
    // Whatever the address carried — a search, another anchor — the step and
    // the entry are what the writer comes back to.
    expect(
      communityContributeHref(
        "/communities/observation-and-care?q=tomato#community-journals",
        entryId,
      ),
    ).toBe(
      `/communities/observation-and-care?contribute=${entryId}#community-contribute`,
    );
  });

  it("dates an entry by the reader's own calendar, not the UTC day", () => {
    // 01:30 on 17 July in Kyiv is still 16 July in UTC.
    const kyivNight = new Date(2026, 6, 17, 1, 30);
    expect(localCalendarDate(kyivNight)).toBe("2026-07-17");
  });
});
