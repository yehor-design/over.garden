import type { Metadata } from "next";
import Link from "next/link";

import { EntryComposer } from "@/components/garden/entry-composer";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import { getEntryComposerCopy } from "@/lib/entry-composer-copy";
import { resolveIllustration } from "@/lib/illustrations";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { hasPriorPublicationDisclosure } from "@/server/journal-repository";
import {
  hasOwnedObjects,
  readOwnedDestination,
} from "@/server/owned-destination-repository";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import {
  EntryComposerShell,
  GARDEN_ENTRY_COMPOSER_PATH,
} from "./entry-composer-shell";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getEntryComposerCopy(locale).title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The one entry composer, as a page (`OVE-486`). The global Write opens it
 * with nothing chosen, so the owned-destination picker comes first; an
 * object's or a space's Write opens it with that destination named
 * (`?object=` / `?space=`). A direct link works on its own. Close returns to
 * `returnTo`, the page it was opened from.
 *
 * Every read is settled (ADR-0023): a destination that cannot be read opens
 * the picker instead, and a failed disclosure read asks for the disclosure
 * rather than skipping it.
 */
export default async function GardenEntryComposerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
    getRequestInterfaceLocale(),
  ]);
  const objectId = firstParam(params.object);
  const spaceId = firstParam(params.space);
  const rawReturnTo = firstParam(params.returnTo);
  const closeHref = rawReturnTo
    ? normalizeJournalComposerReturnTo(rawReturnTo, "/garden")
    : "/garden";

  if (viewer.status === "unavailable") {
    return (
      <EntryComposerShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={GARDEN_ENTRY_COMPOSER_PATH}
        />
      </EntryComposerShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <EntryComposerShell locale={locale}>
        <SignInPrompt locale={locale} next={GARDEN_ENTRY_COMPOSER_PATH} />
      </EntryComposerShell>
    );
  }

  const deadlineMs = workspaceSectionDeadlineMs(3);
  const target = objectId
    ? { kind: "object" as const, id: objectId }
    : spaceId
      ? { kind: "space" as const, id: spaceId }
      : null;
  const [destination, anything, disclosed] = await Promise.all([
    target
      ? settleSection(() => readOwnedDestination(viewer.scope, target), {
          deadlineMs,
          surface: "entry-composer",
          section: "destination",
        })
      : null,
    settleSection(() => hasOwnedObjects(viewer.scope), {
      deadlineMs,
      surface: "entry-composer",
      section: "destinations",
    }),
    settleSection(() => hasPriorPublicationDisclosure(viewer.scope), {
      deadlineMs,
      surface: "entry-composer",
      section: "disclosure",
    }),
  ]);
  const copy = getEntryComposerCopy(locale);

  // Nothing to write to yet: the two ways to have something, not an empty
  // picker. A failed read is not "nothing" — the picker handles that itself.
  if (anything.status === "ready" && !anything.value) {
    return (
      <EntryComposerShell locale={locale}>
        <EmptyState
          illustration={resolveIllustration("first-entry")}
          title={copy.empty.title}
          description={copy.empty.body}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/garden/objects/new"
                className={buttonVariants({})}
                data-entry-composer-empty-action="object"
              >
                {copy.empty.addObject}
              </Link>
              <Link
                href="/garden#first-entry-composer"
                className={buttonVariants({ variant: "secondary" })}
                data-entry-composer-empty-action="first-entry"
              >
                {copy.empty.firstEntry}
              </Link>
            </div>
          }
        />
      </EntryComposerShell>
    );
  }

  return (
    <EntryComposerShell locale={locale}>
      <EntryComposer
        locale={locale}
        initialDestination={
          destination?.status === "ready" ? destination.value : null
        }
        today={new Date().toISOString().slice(0, 10)}
        requiresFirstPublicationDisclosure={
          disclosed.status === "ready" ? !disclosed.value : true
        }
        closeHref={closeHref}
      />
    </EntryComposerShell>
  );
}
