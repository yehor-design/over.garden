import { CATALOG_BROWSE_PATH } from "@/lib/public-catalog-browse";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpenTextIcon as BookOpenText } from "@/components/icons/BookOpenText";
import { PlusCircleIcon as CirclePlus } from "@/components/icons/PlusCircle";
import { CompassIcon as Compass } from "@/components/icons/Compass";
import { PlantIcon as Sprout } from "@/components/icons/Plant";

import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import {
  GardenActions,
  GardenCollection,
  GardenSetup,
} from "@/components/garden/garden-collection";
import {
  activationSurfaceKindForSource,
  normalizeActivationSourceParam,
} from "@/lib/garden/activation";
import type { FirstEntryCatalogSelection } from "@/lib/garden/entry-contracts";
import {
  GARDEN_COLLECTION_SIMPLE_LIMIT,
  isDefaultGardenCollectionRequest,
  normalizeGardenCollectionRequest,
} from "@/lib/garden/garden-collection";
import { getGardenCollectionCopy } from "@/lib/garden-collection-copy";
import { pickerKindForCatalogKind } from "@/lib/garden/catalog-object-kind";
import {
  gardenFirstEntryPreselectionPath,
  publicCatalogEvidencePath,
} from "@/lib/garden/public-paths";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatGardenWorkspaceTemplate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import { localizedPath } from "@/lib/public-localization";
import {
  formatTrustTemplate,
  getLocalizedOAuthErrorMessage,
  getTrustSurfaceCopy,
} from "@/lib/trust-surface-copy";
import { WorkspaceSectionError } from "@/components/garden/workspace-state";
import { findSelectableCatalogItemByPublicSlug } from "@/server/catalog-repository";
import {
  GARDEN_COLLECTION_GROUP_QUERY_COUNT,
  listGardenObjects,
  listGardenSpaces,
} from "@/server/garden-collection-repository";
import { loadGardenWorkspaceContext } from "@/server/garden-workspace-repository";
import { scheduleGardenWorkspaceActivationAnalytics } from "@/server/garden-workspace-after-response";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { hasPriorPublicationDisclosure } from "@/server/journal-repository";
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
import { addCatalogPublicSlugToWishlistAction } from "../../wishlist/actions";
import { FirstEntryComposer } from "../first-entry-composer";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import { GardenWorkspaceServiceState } from "../garden-workspace-service-state";
import { HiddenField } from "@/components/ui/hidden-field";

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
            userId={viewer.userId}
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
  userId,
}: {
  locale: InterfaceLocale;
  params: GardenSearchParams;
  scope: ReturnType<typeof scopedToUser>;
  userId: string;
}) {
  const request = normalizeGardenCollectionRequest(params);
  const groupDeadlineMs = workspaceSectionDeadlineMs(
    GARDEN_COLLECTION_GROUP_QUERY_COUNT,
  );
  const [
    spaces,
    objects,
    context,
    priorPublicationDisclosure,
    initialCatalogItem,
    pendingWishlistItem,
  ] = await Promise.all([
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
    settledOrNull(() => hasPriorPublicationDisclosure(scope)),
    settledOrNull(() => resolveInitialCatalogSelection(params)),
    settledOrNull(() => resolvePendingWishlistSelection(params)),
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
  // The first-entry composer names a new plant and its first entry in one
  // form. It is for a gardener with no plant or animal yet, and for a reader
  // who came here to create one (a catalogue pick, a resumed sign-in, an
  // activation link) — never the returning gardener's home (IA: setup only on
  // explicit create).
  const explicitCreate =
    Boolean(initialCatalogItem) || isExplicitCreateRequest(params);
  const firstObject = objectsValue?.owned === 0;
  const showComposer = setup || firstObject || explicitCreate;

  const activationSource = normalizeActivationSourceParam(params.source, {
    hasResolvedCatalogSelection: Boolean(initialCatalogItem),
  });
  const today = new Date().toISOString().slice(0, 10);
  const collectionCopy = getGardenCollectionCopy(locale);

  if (showComposer) {
    scheduleGardenWorkspaceActivationAnalytics(scope, {
      eventName: "activation_started",
      properties: {
        activation_source: activationSource,
        source_surface_kind: activationSurfaceKindForSource(activationSource),
        actor_class: "real_self_serve",
      },
    });
  }

  const composer = showComposer ? (
    <GardenWriteTools
      today={today}
      locale={locale}
      activationSource={activationSource}
      initialCatalogItem={initialCatalogItem}
      initialSpace={
        spacesValue?.owned === 1 && spacesValue.items[0]
          ? {
              id: spacesValue.items[0].id,
              displayName: spacesValue.items[0].displayName,
            }
          : null
      }
      enableServerPersistence
      ownerUserId={userId}
      requiresFirstPublicationDisclosure={!priorPublicationDisclosure}
    />
  ) : null;

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
        showPublicationNotice={showComposer}
      />
      {pendingWishlistItem ? (
        <PendingWishlistIntentPanel
          item={pendingWishlistItem}
          locale={locale}
        />
      ) : null}

      {setup ? (
        <>
          <GardenSetup locale={locale} />
          {composer}
        </>
      ) : (
        <>
          <GardenActions locale={locale} />
          {explicitCreate ? composer : null}
          <GardenCollection
            locale={locale}
            request={request}
            today={today}
            spaces={spaces}
            objects={objects}
            simple={simple}
          />
          {explicitCreate ? null : composer}
        </>
      )}
    </div>
  );
}

/**
 * A reader who came to `/garden` to create: a first-entry activation link
 * (`?source=`), or a sign-in that resumes creating an object.
 */
function isExplicitCreateRequest(params: GardenSearchParams): boolean {
  const source = firstParam(params.source).replaceAll("_", "-");
  if (
    source === "homepage" ||
    source === "direct-garden" ||
    source === "public-variety"
  ) {
    return true;
  }
  const authIntent = normalizeAuthIntentResumeAction(params.authIntent);
  return authIntent === "create_object" || authIntent === "save";
}

/**
 * A read whose failure is genuinely nothing to show. A catalog preselection
 * that cannot be resolved leaves the composer empty, which is where a gardener
 * who typed no preselection already starts; it does not deserve a panel. It
 * still goes through `settleSection`, so the class is classified and the read
 * is bounded rather than silently swallowed by a bare `catch`.
 */
async function settledOrNull<T>(load: () => Promise<T>): Promise<T | null> {
  const settled = await settleSection(load, {
    deadlineMs: workspaceSectionDeadlineMs(2),
    record: false,
  });
  return settled.status === "ready" ? settled.value : null;
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
  const pendingWishlistItem = await settledOrNull(() =>
    resolvePendingWishlistSelection(params),
  );
  const oauthMessage = getLocalizedOAuthErrorMessage(locale, params.error);

  return (
    <GuestGardenEntry
      locale={locale}
      initialMessage={
        oauthMessage ??
        engagementAuthMessage ??
        (pendingWishlistItem
          ? formatTrustTemplate(
              getTrustSurfaceCopy(locale).gardenGuest.wishlistPrompt,
              { catalogName: pendingWishlistItem.canonicalName },
            )
          : null)
      }
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

/**
 * The first-entry composer: a new plant or animal, its place and its first
 * entry, published together. It is its own section with its own address,
 * `#first-entry-composer`, which setup, `/garden/new` and a resumed sign-in
 * link to.
 */
function GardenWriteTools({
  ownerUserId,
  today,
  locale,
  activationSource,
  initialCatalogItem,
  initialSpace,
  enableServerPersistence,
  requiresFirstPublicationDisclosure,
}: {
  ownerUserId: string;
  today: string;
  locale: InterfaceLocale;
  activationSource: Parameters<
    typeof FirstEntryComposer
  >[0]["activationSource"];
  initialCatalogItem: FirstEntryCatalogSelection | null;
  initialSpace: { id: string; displayName: string } | null;
  enableServerPersistence: boolean;
  requiresFirstPublicationDisclosure: boolean;
}) {
  const copy = getGardenWorkspaceCopy(locale);
  return (
    <Section
      id="first-entry-composer"
      title={copy.page.creation.title}
      description={copy.page.creation.description}
      className="scroll-mt-20 border-t border-border pt-8"
    >
      {/* The path, before the form (`OVE-457` criterion 5). Adding an object
          was a bare form with three unlabelled jobs inside it; a gardener
          could not tell where they were or how much was left. The result at
          the end is `SaveProgressMoment`, which the save redirects to. */}
      <ol
        data-garden-creation-steps="true"
        aria-label={copy.page.creation.stepsLabel}
        className="grid gap-2 sm:grid-cols-3"
      >
        {copy.page.creation.steps.map((step, index) => (
          <li
            key={step}
            className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-text-secondary"
          >
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-action-subtle text-caption font-medium text-action-subtle-text tabular-nums"
            >
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      <div id="write-access">
        <FirstEntryComposer
          ownerUserId={ownerUserId}
          locale={locale}
          key={initialCatalogItem?.id ?? "first-entry"}
          today={today}
          initialClientMutationId={crypto.randomUUID()}
          initialSpace={initialSpace}
          initialCatalogItem={initialCatalogItem}
          activationSource={activationSource}
          enableServerPersistence={enableServerPersistence}
          requiresFirstPublicationDisclosure={
            requiresFirstPublicationDisclosure
          }
        />
      </div>
    </Section>
  );
}

async function resolveInitialCatalogSelection(
  searchParams: GardenSearchParams,
): Promise<FirstEntryCatalogSelection | null> {
  const publicSlug = firstParam(searchParams.catalog);
  if (!publicSlug) return null;
  const item = await findSelectableCatalogItemByPublicSlug(publicSlug);
  if (!item) return null;
  return {
    id: item.id,
    displayName: item.canonicalName,
    kind: pickerKindForCatalogKind(item.catalogKind),
    ...(item.publicSlug
      ? {
          publicPath: publicCatalogEvidencePath({
            catalogKind: item.catalogKind,
            publicSlug: item.publicSlug,
            speciesSlug: item.speciesSlug,
          }),
        }
      : {}),
  };
}

async function resolvePendingWishlistSelection(
  searchParams: GardenSearchParams,
) {
  const publicSlug = firstParam(searchParams.wishlist);
  if (!publicSlug) return null;
  const item = await findSelectableCatalogItemByPublicSlug(publicSlug);
  return item?.publicSlug ? item : null;
}

function PendingWishlistIntentPanel({
  item,
  locale,
}: {
  item: Awaited<ReturnType<typeof resolvePendingWishlistSelection>>;
  locale: InterfaceLocale;
}) {
  if (!item?.publicSlug) return null;
  const copy = getGardenWorkspaceCopy(locale).page.pendingWishlist;
  return (
    <section className="border-y border-border py-5">
      <h2 className="text-h3 text-text-heading">{copy.title}</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        {formatGardenWorkspaceTemplate(copy.description, {
          name: item.canonicalName,
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <OwnerScopedProgressiveForm
          action={addCatalogPublicSlugToWishlistAction}
        >
          <HiddenField name="catalogPublicSlug" value={item.publicSlug} />
          <HiddenField name="locale" value={locale} />
          <HiddenField
            name="returnTo"
            value={localizedPath(locale, "/wishlist")}
          />
          <button type="submit" className={buttonVariants()}>
            {copy.save}
          </button>
        </OwnerScopedProgressiveForm>
        <Link
          href={gardenFirstEntryPreselectionPath(item.publicSlug)}
          className={buttonVariants({ variant: "secondary" })}
        >
          <CirclePlus aria-hidden="true" />
          {copy.startFirstEntry}
        </Link>
      </div>
    </section>
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
