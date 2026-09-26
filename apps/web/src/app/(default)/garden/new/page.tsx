import type { Metadata } from "next";
import Link from "next/link";

import {
  EntryComposer,
  type EntryComposerCommunity,
} from "@/components/garden/entry-composer";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import { getCommunityContentCopy } from "@/lib/community-copy";
import { publicCommunityPath } from "@/lib/garden/public-paths";
import {
  localizedPath,
  stripLocalePrefix,
  type PublicLocale,
} from "@/lib/public-localization";
import { readCommunityWritingContext } from "@/server/community-repository";
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

const COMMUNITY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

/**
 * The community's own address to come back to: the `returnTo` it sent when
 * that is this community's page in some language, and its address in the
 * reader's language otherwise. Never somewhere else — a composer opened "for
 * a community" returns to that community.
 */
function communityReturnPath(
  slug: string,
  returnTo: string | undefined,
  locale: PublicLocale,
) {
  const own = publicCommunityPath(slug);
  if (returnTo) {
    const path = returnTo.split(/[?#]/u)[0] ?? "";
    if (stripLocalePrefix(path).path === own) return path;
  }
  return localizedPath(locale, own);
}

/**
 * The composer's own address with the context it was opened with.
 *
 * The slashes of `returnTo` stay literal (`OVE-501`). The return-path guard
 * (`internal-return-path.ts`) refuses an encoded `/` anywhere in an address,
 * and `URLSearchParams` encodes every one — so signing in from a reminder's
 * Write, or from a community's, came back to an empty composer with the plant
 * and the way back both gone. A literal `/` is valid in a query; `#` and `&`
 * stay encoded.
 */
function composerSignInReturn(params: {
  object?: string;
  space?: string;
  community?: string;
  returnTo?: string;
}) {
  const search = Object.entries(params)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(
      ([key, value]) =>
        `${key}=${encodeURIComponent(value).replace(/%2F/giu, "/")}`,
    )
    .join("&");
  return search
    ? `${GARDEN_ENTRY_COMPOSER_PATH}?${search}`
    : GARDEN_ENTRY_COMPOSER_PATH;
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
 * rather than skipping it. A destination that is not there — a reminder
 * opened after its plant was deleted — opens the picker too, and says so
 * (`OVE-501`, criterion 2).
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
  const communitySlug = firstParam(params.community)?.trim().toLowerCase();
  const community =
    communitySlug && COMMUNITY_SLUG_PATTERN.test(communitySlug)
      ? {
          slug: communitySlug,
          returnPath: communityReturnPath(communitySlug, rawReturnTo, locale),
        }
      : null;
  const closeHref = community
    ? community.returnPath
    : rawReturnTo
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
    // Signing in comes back to this composer as it was opened — the object,
    // the space, or the community it writes for (`OVE-500`, criterion 2).
    return (
      <EntryComposerShell locale={locale}>
        <SignInPrompt
          locale={locale}
          next={composerSignInReturn({
            object: objectId,
            space: spaceId,
            community: community?.slug,
            returnTo: community ? community.returnPath : rawReturnTo,
          })}
        />
      </EntryComposerShell>
    );
  }

  const deadlineMs = workspaceSectionDeadlineMs(3);
  const target = objectId
    ? { kind: "object" as const, id: objectId }
    : spaceId
      ? { kind: "space" as const, id: spaceId }
      : null;
  const [destination, anything, disclosed, writingFor] = await Promise.all([
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
    community
      ? settleSection(
          () => readCommunityWritingContext(viewer.scope, community.slug),
          { deadlineMs, surface: "entry-composer", section: "community" },
        )
      : null,
  ]);
  // A community that cannot be read, or is not there, is simply not named:
  // the composer is still the composer, and Close still goes back to it.
  const communityContext: EntryComposerCommunity | null =
    community && writingFor?.status === "ready" && writingFor.value
      ? {
          name: getCommunityContentCopy(locale, writingFor.value.contentKey)
            .name,
          returnPath: community.returnPath,
          accepting:
            writingFor.value.accepting &&
            writingFor.value.membershipState !== "banned",
          member: writingFor.value.membershipState === "active",
          banned: writingFor.value.membershipState === "banned",
        }
      : null;
  const copy = getEntryComposerCopy(locale);

  // Nothing to write to yet: the two ways to have something, not an empty
  // picker. A failed read is not "nothing" — the picker handles that itself.
  if (anything.status === "ready" && !anything.value) {
    // Writing for a community with nothing to write about yet: add the plant
    // or animal first, and come straight back to this composer with it chosen
    // and the community still named (object setup appends `object=`).
    const addObjectHref = community
      ? `/garden/objects/new?${new URLSearchParams({
          returnTo: composerSignInReturn({
            community: community.slug,
            returnTo: community.returnPath,
          }),
        }).toString()}`
      : "/garden/objects/new";
    return (
      <EntryComposerShell locale={locale}>
        {/* The last plant was deleted and a reminder for it still opened
            this: say so above the way to add one. */}
        {target && destination?.status === "ready" && !destination.value ? (
          <Callout
            tone="warning"
            data-entry-composer-destination-notice={target.kind}
          >
            <p>{copy.destinationNotice[target.kind]}</p>
          </Callout>
        ) : null}
        <EmptyState
          illustration={resolveIllustration("first-entry")}
          title={copy.empty.title}
          description={copy.empty.body}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {community ? null : (
                <Link
                  href="/garden/spaces/new?returnTo=%2Fgarden%2Fnew"
                  className={buttonVariants({})}
                  data-entry-composer-empty-action="space"
                >
                  {copy.empty.addSpace}
                </Link>
              )}
              <Link
                href={addObjectHref}
                className={buttonVariants(community ? {} : { variant: "secondary" })}
                data-entry-composer-empty-action="object"
              >
                {copy.empty.addObject}
              </Link>
              {community ? (
                <Link
                  href={community.returnPath}
                  className={buttonVariants({ variant: "secondary" })}
                  data-entry-composer-empty-action="community"
                >
                  {copy.community.back}
                </Link>
              ) : null}
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
        community={communityContext}
        destinationNotice={
          !target || !destination
            ? null
            : destination.status === "error"
              ? "unavailable"
              : destination.value
                ? null
                : target.kind
        }
      />
    </EntryComposerShell>
  );
}
