import { postgresRejection } from "@test/postgres-rejection";
import { renderServerHtml } from "@test/render-server-html";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntryComposerProps } from "@/components/garden/entry-composer";
import { getEntryComposerCopy } from "@/lib/entry-composer-copy";
import type { OwnedDestination } from "@/lib/garden/owned-destinations";
import {
  normalizeInternalReturnPath,
  parseInternalReturnPath,
} from "@/lib/navigation/internal-return-path";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceViewer: vi.fn(),
  getRequestInterfaceLocale: vi.fn(),
  readOwnedDestination: vi.fn(),
  hasOwnedObjects: vi.fn(),
  hasPriorPublicationDisclosure: vi.fn(),
  readCommunityWritingContext: vi.fn(),
  composer: vi.fn(),
}));

vi.mock("@/server/workspace-access", () => ({
  resolveWorkspaceViewer: mocks.resolveWorkspaceViewer,
}));
vi.mock("@/server/interface-localization", () => ({
  getRequestInterfaceLocale: mocks.getRequestInterfaceLocale,
}));
vi.mock("@/server/owned-destination-repository", () => ({
  readOwnedDestination: mocks.readOwnedDestination,
  hasOwnedObjects: mocks.hasOwnedObjects,
}));
vi.mock("@/server/journal-repository", () => ({
  hasPriorPublicationDisclosure: mocks.hasPriorPublicationDisclosure,
}));
vi.mock("@/server/community-repository", () => ({
  readCommunityWritingContext: mocks.readCommunityWritingContext,
}));
// The composer has its own suite (`entry-composer.test.tsx`); here it is the
// props this page hands it.
vi.mock("@/components/garden/entry-composer", () => ({
  EntryComposer: (props: EntryComposerProps) => {
    mocks.composer(props);
    return (
      <section
        data-entry-composer-stub="true"
        data-destination-notice={props.destinationNotice ?? "none"}
      />
    );
  },
}));
vi.mock("@/app/(default)/auth/sign-in-prompt", () => ({
  SignInPrompt: (props: { next?: string }) => (
    <section data-sign-in-prompt="true" data-next={props.next ?? ""}>
      Sign in prompt
    </section>
  ),
}));

const SCOPE = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "session-1",
};
const OBJECT_ID = "20000000-0000-4000-8000-000000000001";
const SPACE_ID = "10000000-0000-4000-8000-000000000001";
// Where a reminder's Write comes back to: its own row of the same view.
const REMINDER_RETURN = `/notifications?filter=reminders#notification-${"a".repeat(32)}`;
const TOMATO: OwnedDestination = {
  kind: "object",
  id: OBJECT_ID,
  displayName: "Томат",
  objectKind: "plant",
  parent: { id: SPACE_ID, displayName: "Балкон" },
  species: "Solanum lycopersicum",
};
const uk = getEntryComposerCopy("uk");

async function renderComposer(params: Record<string, string> = {}) {
  const { default: Page } = await import("./page");
  return renderServerHtml(
    await Page({ searchParams: Promise.resolve(params) }),
  );
}

function composerProps(): EntryComposerProps {
  expect(mocks.composer).toHaveBeenCalledTimes(1);
  return mocks.composer.mock.calls[0]![0] as EntryComposerProps;
}

describe("/garden/new — a link that names where to write (OVE-501)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "signed-in",
      userId: SCOPE.userId,
      scope: SCOPE,
    });
    mocks.getRequestInterfaceLocale.mockResolvedValue("uk");
    mocks.readOwnedDestination.mockResolvedValue(TOMATO);
    mocks.hasOwnedObjects.mockResolvedValue(true);
    mocks.hasPriorPublicationDisclosure.mockResolvedValue(true);
  });

  it("opens a reminder's plant, says nothing about the link, and closes back to the row", async () => {
    const html = await renderComposer({
      object: OBJECT_ID,
      returnTo: REMINDER_RETURN,
    });

    expect(mocks.readOwnedDestination).toHaveBeenCalledWith(SCOPE, {
      kind: "object",
      id: OBJECT_ID,
    });
    expect(composerProps()).toMatchObject({
      initialDestination: TOMATO,
      destinationNotice: null,
      closeHref: REMINDER_RETURN,
    });
    expect(html).toContain('data-destination-notice="none"');
  });

  it.each([
    ["object", { object: OBJECT_ID }],
    ["space", { space: SPACE_ID }],
  ] as const)(
    "opens the picker and says the %s the link named is gone",
    async (kind, params) => {
      mocks.readOwnedDestination.mockResolvedValue(null);

      await renderComposer({ ...params, returnTo: REMINDER_RETURN });

      expect(composerProps()).toMatchObject({
        initialDestination: null,
        destinationNotice: kind,
        closeHref: REMINDER_RETURN,
      });
    },
  );

  it("says the place could not be opened when its read fails, instead of that it is gone", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readOwnedDestination.mockRejectedValue(postgresRejection("57014"));

    await renderComposer({ object: OBJECT_ID });

    expect(composerProps()).toMatchObject({
      initialDestination: null,
      destinationNotice: "unavailable",
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: "workspace_section_degraded",
      surface: "entry-composer",
      section: "destination",
      failureClass: "query_timeout",
    });
    log.mockRestore();
  });

  it("has nothing to say, and reads nothing, when the link named no place", async () => {
    await renderComposer();

    expect(mocks.readOwnedDestination).not.toHaveBeenCalled();
    expect(composerProps()).toMatchObject({
      initialDestination: null,
      destinationNotice: null,
      closeHref: "/garden",
    });
  });

  it("says the plant is gone above the way to add one, when it was the last one", async () => {
    mocks.readOwnedDestination.mockResolvedValue(null);
    mocks.hasOwnedObjects.mockResolvedValue(false);

    const html = await renderComposer({
      object: OBJECT_ID,
      returnTo: REMINDER_RETURN,
    });
    const notice = html.indexOf(
      'data-entry-composer-destination-notice="object"',
    );

    expect(notice).toBeGreaterThan(-1);
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain(uk.destinationNotice.object);
    expect(notice).toBeLessThan(
      html.indexOf('data-entry-composer-empty-action="object"'),
    );
    expect(mocks.composer).not.toHaveBeenCalled();
  });

  it("adds no notice to the empty garden when no place was named, or its read failed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.hasOwnedObjects.mockResolvedValue(false);

    const unnamed = await renderComposer();
    mocks.readOwnedDestination.mockRejectedValue(postgresRejection("57014"));
    const unread = await renderComposer({ object: OBJECT_ID });

    for (const html of [unnamed, unread]) {
      expect(html).toContain('data-entry-composer-empty-action="object"');
      expect(html).not.toContain("data-entry-composer-destination-notice");
    }
    log.mockRestore();
  });

  it("brings a guest back to the same plant and the same row, through the return-path guard", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "sign-in-required",
    });

    const html = await renderComposer({
      object: OBJECT_ID,
      returnTo: REMINDER_RETURN,
    });
    const next = /data-next="([^"]*)"/u
      .exec(html)?.[1]
      ?.replaceAll("&amp;", "&");

    // Slashes stay literal: the guard refuses an encoded `/` anywhere, and a
    // refused `next` fell back to `/garden` with the plant and the row gone.
    expect(next).toBe(
      `/garden/new?object=${OBJECT_ID}&returnTo=/notifications%3Ffilter%3Dreminders%23notification-${"a".repeat(32)}`,
    );
    expect(parseInternalReturnPath(next)).toBe(next);
    expect(normalizeInternalReturnPath(next, "/garden")).toBe(next);
    const back = new URL(next!, "https://over.garden");
    expect(back.pathname).toBe("/garden/new");
    expect(back.hash).toBe("");
    expect(back.searchParams.get("object")).toBe(OBJECT_ID);
    expect(back.searchParams.get("returnTo")).toBe(REMINDER_RETURN);
    expect(mocks.readOwnedDestination).not.toHaveBeenCalled();
  });

  it("brings a guest writing for a community back to it, through the same guard", async () => {
    mocks.resolveWorkspaceViewer.mockResolvedValue({
      status: "sign-in-required",
    });

    const html = await renderComposer({
      community: "observation-and-care",
      returnTo: "/communities/observation-and-care?q=tomato",
    });
    const next = /data-next="([^"]*)"/u
      .exec(html)?.[1]
      ?.replaceAll("&amp;", "&");

    expect(next).toBe(
      "/garden/new?community=observation-and-care&returnTo=/communities/observation-and-care",
    );
    expect(parseInternalReturnPath(next)).toBe(next);
  });
});
