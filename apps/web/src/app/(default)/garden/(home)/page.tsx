import { CATALOG_BROWSE_PATH } from "@/lib/public-catalog-browse";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpenTextIcon as BookOpenText } from "@/components/icons/BookOpenText";
import { CompassIcon as Compass } from "@/components/icons/Compass";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { buttonVariants } from "@/components/ui/button";
import {
  GardenActions,
  GardenCollection,
  GardenSetup,
} from "@/components/garden/garden-collection";
import {
  GARDEN_COLLECTION_SIMPLE_LIMIT,
  isDefaultGardenCollectionRequest,
  normalizeGardenCollectionRequest,
} from "@/lib/garden/garden-collection";
import { getGardenCollectionCopy } from "@/lib/garden-collection-copy";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { localizedPath } from "@/lib/public-localization";
import {
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import {
  GARDEN_COLLECTION_GROUP_QUERY_COUNT,
  listGardenObjects,
  listGardenSpaces,
} from "@/server/garden-collection-repository";
import { loadGardenWorkspaceContext } from "@/server/garden-workspace-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import {
  GARDEN_HOME_PATH,
  GardenHomeSectionsSkeleton,
  GardenHomeShell,
} from "./garden-home-shell";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { GardenWorkspaceServiceState } from "../garden-workspace-service-state";

type GardenSearchParams = Record<string, string | string[] | undefined>;
const EMPTY_GARDEN_SEARCH_PARAMS: GardenSearchParams = {};

interface GardenPageProps {
  searchParams?: Promise<GardenSearchParams>;
}

export default async function GardenPage({ searchParams }: GardenPageProps) {
  const [viewer, params, locale] = await Promise.all([
    resolveWorkspaceViewer(),
    searchParams ?? Promise.resolve(EMPTY_GARDEN_SEARCH_PARAMS),
    getRequestInterfaceLocale(),
  ]);
  const engagementAuthMessage = engagementAuthPrompt(locale, params.engagement);
  const engagementPostAuthPath = engagementAuthMessage
    ? normalizeGardenReturnToParam(params.returnTo)
    : null;

  // The session store is the one read allowed before the shell, and it can fail
  // like any other. Saying so is a different sentence from "sign in" and points
  // at a different fix (ADR-0023).
  if (viewer.status === "unavailable") {
    return (
      <GardenHomeShell locale={locale}>
        <div className="px-4 py-8 sm:px-6">
          <WorkspaceSectionError
            locale={locale}
            failure={viewer.failure}
            retryHref={GARDEN_HOME_PATH}
          />
        </div>
      </GardenHomeShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <GuestGardenEntrySection
        locale={locale}
        params={params}
        engagementAuthMessage={engagementAuthMessage}
        engagementPostAuthPath={engagementPostAuthPath}
      />
    );
  }

  if (engagementPostAuthPath && engagementPostAuthPath !== "/garden") {
    redirect(engagementPostAuthPath);
  }
  // The combined space + object + first entry form is gone (ADR-0035 D1).
  // A catalogue launch and a resumed "add a plant or an animal" go to object
  // setup, which reads the same `catalog` preselection.
  const catalog = firstParam(params.catalog);
  const resumedAction = normalizeAuthIntentResumeAction(params.authIntent);
  if (catalog || resumedAction === "create_object") {
    redirect(
      catalog
        ? `/garden/objects/new?catalog=${encodeURIComponent(catalog)}`
        : "/garden/objects/new",
    );
  }

  return (
    <>
      <AuthIntentFocus
        action={normalizeAuthIntentResumeAction(params.authIntent)}
        control={normalizeAuthIntentResumeControl(params.authControl)}
      />
      <GardenHomeShell locale={locale}>
        <Suspense fallback={<GardenHomeSectionsSkeleton locale={locale} />}>
          <GardenHomeSections
            locale={locale}
            params={params}
            scope={viewer.scope}
          />
        </Suspense>
      </GardenHomeShell>
    </>
  );
}

/**
 * Everything on the home page that needs the database (`OVE-489`). It never
 * throws: the two collection groups, the context rail and the three smaller
 * reads each go through `settleSection`, so the worst case is a designed
 * panel in one place rather than a boundary that never resolves — and a
 * failed group never reads as an empty garden.
 */
async function GardenHomeSections({
  locale,
  params,
  scope,
}: {
  locale: InterfaceLocale;
  params: GardenSearchParams;
  scope: ReturnType<typeof scopedToUser>;
}) {
  const request = normalizeGardenCollectionRequest(params);
  const groupDeadlineMs = workspaceSectionDeadlineMs(
    GARDEN_COLLECTION_GROUP_QUERY_COUNT,
  );
  const [spaces, objects, context] = await Promise.all([
    settleSection(() => listGardenSpaces(scope, request), {
      deadlineMs: groupDeadlineMs,
      surface: "garden-home",
      section: "spaces",
    }),
    settleSection(() => listGardenObjects(scope, request), {
      deadlineMs: groupDeadlineMs,
      surface: "garden-home",
      section: "objects",
    }),
    // Settles its two reads itself; wrapped anyway, because "is not supposed
    // to reject" is the assumption ADR-0023 exists to retire.
    settleSection(() => loadGardenWorkspaceContext(scope), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "garden-home",
      section: "context",
    }),
  ]);

  const spacesValue = spaces.status === "ready" ? spaces.value : null;
  const objectsValue = objects.status === "ready" ? objects.value : null;
  // Only two reads that both answered can say the garden is empty.
  const setup = spacesValue?.owned === 0 && objectsValue?.owned === 0;
  const ownedTotal =
    spacesValue && objectsValue ? spacesValue.owned + objectsValue.owned : null;
  const simple =
    isDefaultGardenCollectionRequest(request) &&
    ownedTotal !== null &&
    ownedTotal <= GARDEN_COLLECTION_SIMPLE_LIMIT;
  const today = new Date().toISOString().slice(0, 10);
  const collectionCopy = getGardenCollectionCopy(locale);

  return (
    <div
      data-garden-workspace={setup ? "setup" : "collection"}
      className="flex flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8"
    >
      <GardenWorkspaceServiceState
        locale={locale}
        nextAction={{
          href: "/garden/new",
          label: collectionCopy.actions.newEntry,
        }}
        recent={
          context.status === "ready" && context.value.recent.status === "ready"
            ? context.value.recent.value
            : []
        }
        inbox={
          context.status === "ready" && context.value.inbox.status === "ready"
            ? context.value.inbox.value
            : null
        }
        showPublicationNotice={false}
      />

      {setup ? (
        <GardenSetup locale={locale} />
      ) : (
        <>
          <GardenActions locale={locale} />
          <GardenCollection
            locale={locale}
            request={request}
            today={today}
            spaces={spaces}
            objects={objects}
            simple={simple}
          />
        </>
      )}
    </div>
  );
}

/**
 * The signed-out home. Its two reads are preselection niceties, so they settle
 * to `null` and the sign-in panel still renders in full.
 */
async function GuestGardenEntrySection({
  locale,
  params,
  engagementAuthMessage,
  engagementPostAuthPath,
}: {
  locale: InterfaceLocale;
  params: GardenSearchParams;
  engagementAuthMessage: string | null;
  engagementPostAuthPath: string | null;
}) {
  const oauthMessage = getLocalizedOAuthErrorMessage(locale, params.error);

  return (
    <GuestGardenEntry
      locale={locale}
      initialMessage={oauthMessage ?? engagementAuthMessage}
      postAuthPath={engagementPostAuthPath}
    />
  );
}

function GuestGardenEntry({
  locale,
  initialMessage,
  postAuthPath,
}: {
  locale: InterfaceLocale;
  initialMessage?: string | null;
  postAuthPath?: string | null;
}) {
  const copy = getTrustSurfaceCopy(locale).gardenGuest;

  return (
    <main
      lang={locale}
      data-garden-workspace="guest"
      className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-6 sm:px-6 sm:py-8"
    >
      <header className="border-b border-border pb-5">
        <p className="text-overline text-text-muted uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-1 text-h1 text-text-heading">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-body-sm leading-6 text-text-muted">
          {copy.description}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SignInPrompt
            locale={locale}
            next={postAuthPath ?? "/garden"}
            description={initialMessage ?? undefined}
          />
        </div>
        <aside className="border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <p className="text-overline text-text-muted uppercase">
            {copy.exploreEyebrow}
          </p>
          <h2 className="mt-1 text-h3 text-text-heading">
            {copy.exploreTitle}
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={localizedPath(locale, "/journals")}
              className={buttonVariants({
                variant: "secondary",
                className: "justify-start",
              })}
            >
              <BookOpenText aria-hidden="true" />
              {copy.publicJournals}
            </Link>
            <Link
              href={localizedPath(locale, CATALOG_BROWSE_PATH)}
              className={buttonVariants({
                variant: "secondary",
                className: "justify-start",
              })}
            >
              <Sprout aria-hidden="true" />
              {copy.livingObjects}
            </Link>
            <Link
              href={localizedPath(locale, "/knowledge")}
              className={buttonVariants({
                variant: "secondary",
                className: "justify-start",
              })}
            >
              <Compass aria-hidden="true" />
              {copy.knowledge}
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function engagementAuthPrompt(
  locale: InterfaceLocale,
  value: string | string[] | undefined,
) {
  const intent = firstParam(value);
  const copy = getTrustSurfaceCopy(locale).gardenGuest;
  if (intent === "comment-auth") return copy.commentPrompt;
  if (intent === "bookmark-auth") return copy.bookmarkPrompt;
  return null;
}

function normalizeGardenReturnToParam(value: string | string[] | undefined) {
  return normalizeInternalReturnPath(firstParam(value), "/garden");
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}
