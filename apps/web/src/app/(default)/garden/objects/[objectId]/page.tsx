import Link from "next/link";
import { Suspense } from "react";

import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import {
  LivingObjectPassportContextRail,
  LivingObjectPassportOverview,
  OwnerLivingObjectPassportTimeline,
} from "@/components/living-object-passport/living-object-passport";
import { buttonVariants } from "@/components/ui/button";
import { AuthIntentFocus } from "@/components/auth/auth-intent-focus";
import type { EntryScope, LocationVisibility, VarietyState } from "@/db/schema";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  formatGardenWorkspaceDate,
  getGardenWorkspaceCopy,
} from "@/lib/garden-workspace-copy";
import {
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
} from "@/lib/auth/auth-intent-contract";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
  type OwnerObjectCopy,
} from "@/lib/owner-object-copy";
import { EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE } from "@/lib/catalog/eu-official-journal-common-catalogue";
import { isObjectProgressMomentEligible } from "@/lib/garden/object-progress-moment";
import { normalizeSaveProgressMomentKind } from "@/lib/garden/save-progress-moment";
import {
  publicJournalEntryAddress,
  publicLineageObjectPath,
  publicObjectPassportPath,
} from "@/lib/garden/public-paths";
import { getPublicAuthorHandle } from "@/server/author-handle-repository";
import { localizedPath } from "@/lib/public-localization";
import { recordAnalyticsEventSafely } from "@/server/analytics-events";
import { resolveFollowUpValuePulsePrompt } from "@/server/follow-up-value-pulse";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  getPlantObjectPage,
  type PlantObjectPage,
} from "@/server/journal-repository";
import {
  getObjectProvenancePanel,
  type LineageProvenanceEdgeReadback,
  type LineagePlantObjectOption,
  type ObjectProvenancePanel,
} from "@/server/lineage-repository";
import { buildOwnerObjectPassportPresentation } from "@/server/owner-object-passport-presentation";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";
import { gardenObjectPath, ObjectShell } from "./object-shell";
import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  deleteJournalEntryAction,
  createLineageInvitationAction,
  createProvenanceEdgeAction,
  resolvePlantObjectCatalogAction,
  updatePlantObjectLocationAction,
} from "./actions";
import { OwnerScopedProgressiveForm } from "@/components/auth/owner-scope";
import { CatalogResolveControl } from "./catalog-resolve-control";
import { FollowUpEntryComposer } from "./follow-up-entry-composer";
import { FollowUpValuePulse } from "./follow-up-value-pulse";
import { LocationPrivacyControl } from "./location-privacy-control";
import { ObjectProgressMoment } from "./object-progress-moment";
import { SaveProgressMoment } from "../../save-progress-moment";
import { HiddenField } from "@/components/ui/hidden-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface PlantObjectPageProps {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{
    valuePulse?: string;
    entryId?: string;
    saveProgress?: string | string[];
    authIntent?: string | string[];
    authControl?: string | string[];
  }>;
}

export default async function PlantObjectReadbackPage({
  params,
  searchParams,
}: PlantObjectPageProps) {
  const [{ objectId }, query, viewer, locale] = await Promise.all([
    params,
    searchParams,
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getInterfaceCopy(locale);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);

  if (viewer.status === "unavailable") {
    return (
      <ObjectShell locale={locale}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={gardenObjectPath(objectId)}
        />
      </ObjectShell>
    );
  }

  if (viewer.status === "sign-in-required") {
    return (
      <ObjectShell locale={locale}>
        <SignInPrompt locale={locale} next={`/garden/objects/${objectId}`} />
      </ObjectShell>
    );
  }

  return (
    <ObjectShell locale={locale}>
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
      <Suspense
        fallback={
          <WorkspaceSectionSkeleton
            locale={locale}
            title={copy.object.livingObject}
            rows={3}
          />
        }
      >
        <PlantObjectSections
          locale={locale}
          objectId={objectId}
          query={query}
          scope={viewer.scope}
          userId={viewer.userId}
        />
      </Suspense>
    </ObjectShell>
  );
}

/**
 * The whole passport, settled. The object read and the provenance read are
 * bounded together because the presentation needs both; a missing record is a
 * rendered state rather than `notFound()`, for the reason `WorkspaceMissingRecord`
 * records.
 */
async function PlantObjectSections({
  locale,
  objectId,
  query,
  scope,
  userId,
}: {
  locale: InterfaceLocale;
  objectId: string;
  query: Awaited<PlantObjectPageProps["searchParams"]>;
  scope: RequestScope;
  userId: string;
}) {
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const ownerCopy = getOwnerObjectCopy(locale);

  const settled = await settleSection(
    async () => {
      const page = await getPlantObjectPage(scope, objectId);
      if (!page) return null;
      const provenancePanel = await getObjectProvenancePanel(scope, objectId);
      return provenancePanel ? { page, provenancePanel } : null;
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(6),
      surface: "object",
      section: "passport",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={copy.object.livingObject}
        retryHref={gardenObjectPath(objectId)}
      />
    );
  }
  if (!settled.value) return <WorkspaceMissingRecord locale={locale} />;

  const { page, provenancePanel } = settled.value;
  const showProgressMoment = isObjectProgressMomentEligible(
    page.entries.length,
  );
  // Analytics is a side effect of rendering this passport, never a reason not
  // to render it: bounded here so a slow or unhappy recorder cannot become the
  // reason a gardener stares at a skeleton.
  await settleSection(
    async () => {
      await recordOwnRecordRevisited(scope, page);
      if (showProgressMoment) await recordProgressMomentShown(scope, page);
    },
    {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "object",
      section: "analytics",
      record: false,
    },
  );

  const today = new Date().toISOString().slice(0, 10);
  const saveProgressKind = normalizeSaveProgressMomentKind(query.saveProgress);
  const sourceAttributionCaveat =
    page.plantObject.source_credit?.sourceSlug ===
    EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE
      ? ownerCopy.source.euLegalCaveat
      : null;
  // The owner's registry handle: every public link on this page hangs from
  // it (ADR-0029 D9). The legacy id path, which 308s, only for an object
  // that has no slug yet — and that one keeps the locale prefix, because it
  // renders in its own route family.
  //
  // Settled, like every other read on a workspace render path. It was awaited
  // bare from the day the addresses moved under authors: one rejection here
  // and the whole passport — which has already loaded — became a boundary that
  // never resolves on a hard load (ADR-0023). A handle that cannot be read is
  // an absent handle, which is the case the fallback already covers.
  const authorHandleSection = await settleSection(
    () => getPublicAuthorHandle(scope.userId),
    {
      deadlineMs: workspaceSectionDeadlineMs(1),
      surface: "object",
      section: "author-handle",
    },
  );
  const authorHandle =
    authorHandleSection.status === "ready" ? authorHandleSection.value : null;
  const passportPath = ownPassportPath(page, objectId, authorHandle, locale);
  const lineageReadbackPath = getLineageReadbackPath(
    page,
    provenancePanel,
    passportPath,
  );
  const objectPassportReadbackPath = hasActivePublicEntry(page)
    ? passportPath
    : null;
  const valuePulseJournalEntryId =
    query.valuePulse === "1" && typeof query.entryId === "string"
      ? query.entryId.trim()
      : "";
  // A value pulse is an optional prompt on top of a page that already renders,
  // so its failure is its absence — bounded and classified all the same.
  const valuePulseSection =
    valuePulseJournalEntryId.length > 0
      ? await settleSection(
          () =>
            resolveFollowUpValuePulsePrompt(scope, {
              plantObjectId: objectId,
              journalEntryId: valuePulseJournalEntryId,
            }),
          {
            deadlineMs: workspaceSectionDeadlineMs(2),
            surface: "object",
            section: "value-pulse",
            record: false,
          },
        )
      : null;
  const valuePulsePrompt =
    valuePulseSection?.status === "ready"
      ? valuePulseSection.value
      : { eligible: false };
  const presentation = buildOwnerObjectPassportPresentation(
    page,
    provenancePanel,
    locale,
    authorHandle,
  );
  const entriesById = new Map(page.entries.map((entry) => [entry.id, entry]));

  return (
    <>
      <LivingObjectPassportContextRail
        passport={presentation}
        locale={locale}
      />
      <LivingObjectPassportOverview passport={presentation} locale={locale} />

      {saveProgressKind === "first-entry" ||
      saveProgressKind === "follow-up" ? (
        <SaveProgressMoment
          locale={locale}
          kind={saveProgressKind}
          entryCount={page.entries.length}
          objectName={page.plantObject.display_name}
          entryTitle={page.entries[0]?.title ?? null}
          primaryHref="#follow-up-composer"
          primaryLabel={workspaceCopy.saveProgress.actions.addAnotherEntry}
          secondaryHref="/garden"
          secondaryLabel={copy.object.backToJournal}
        />
      ) : null}

      {valuePulsePrompt.eligible ? (
        <FollowUpValuePulse
          locale={locale}
          objectId={objectId}
          journalEntryId={valuePulseJournalEntryId}
        />
      ) : null}

      {showProgressMoment ? (
        <ObjectProgressMoment
          locale={locale}
          objectName={page.plantObject.display_name}
          entries={page.entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            body: entry.body,
            entryDate: entry.entry_date,
            mediaPublicUrl: entry.media?.publicUrl ?? null,
            mediaFocalX: entry.media?.focalX ?? null,
            mediaFocalY: entry.media?.focalY ?? null,
            mediaIntrinsicWidth: entry.media?.intrinsicWidth ?? null,
            mediaIntrinsicHeight: entry.media?.intrinsicHeight ?? null,
          }))}
        />
      ) : null}

      <section
        id="follow-up-composer"
        className="grid gap-4 border-t border-border pt-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-text-heading">
            {ownerCopy.followUpSection.title}
          </h2>
          <p className="text-body-sm text-text-muted">
            {ownerCopy.followUpSection.description}
          </p>
        </div>

        <FollowUpEntryComposer
          ownerUserId={userId}
          locale={locale}
          objectId={objectId}
          objectDisplayName={page.plantObject.display_name}
          objectKind={page.plantObject.object_kind}
          today={today}
          initialClientMutationId={crypto.randomUUID()}
          requiresFirstPublicationDisclosure={
            !page.hasPriorPublicationDisclosure
          }
        />
      </section>

      <OwnerLivingObjectPassportTimeline
        passport={presentation}
        locale={locale}
        renderEntryActions={(timelineEntry) => {
          const entry = entriesById.get(timelineEntry.id);
          return entry ? (
            <OwnerEntryActions
              entry={entry}
              objectId={objectId}
              objectPassportReadbackPath={objectPassportReadbackPath}
              locale={locale}
              authorHandle={authorHandle}
            />
          ) : null;
        }}
      />

      <section
        id="passport-management"
        className="grid gap-5 border-t border-border pt-5"
      >
        <div>
          <p className="text-overline text-text-muted uppercase">
            {ownerCopy.management.eyebrow}
          </p>
          <h2 className="mt-1 text-h2 text-text-heading">
            {ownerCopy.management.title}
          </h2>
        </div>

        <div id="passport-privacy" className="min-w-0">
          <LocationPrivacyControl
            locale={locale}
            objectId={objectId}
            currentLocationVisibility={page.plantObject.location_visibility}
            currentCoarseRegionCode={page.plantObject.coarse_region_code}
            action={updatePlantObjectLocationAction}
          />
        </div>

        {canResolveCatalogState(page.plantObject.variety_state) ? (
          <div id="passport-catalog" className="min-w-0">
            <CatalogResolveControl
              locale={locale}
              objectId={page.plantObject.id}
              objectKind={page.plantObject.object_kind}
              currentVarietyText={page.plantObject.variety_text}
              currentVarietyState={
                page.plantObject.variety_state as VarietyState
              }
              action={resolvePlantObjectCatalogAction}
            />
          </div>
        ) : null}

        {page.plantObject.source_credit ? (
          <div className="grid gap-1 border-t border-border pt-4 text-caption leading-5 text-text-muted">
            <p>
              {formatOwnerObjectTemplate(ownerCopy.source.summary, {
                sourceName: page.plantObject.source_credit.sourceName,
              })}
            </p>
            {sourceAttributionCaveat ? <p>{sourceAttributionCaveat}</p> : null}
            <Link
              href={page.plantObject.source_credit.sourceUrl}
              className="text-link hover:text-link-hover w-fit font-medium underline-offset-4 hover:underline"
            >
              {ownerCopy.source.open}
            </Link>
          </div>
        ) : null}
      </section>

      <ProvenanceSection
        objectId={objectId}
        provenancePanel={provenancePanel}
        writeEnabled
        lineageReadbackPath={lineageReadbackPath}
        locale={locale}
      />
    </>
  );
}

function OwnerEntryActions({
  entry,
  objectId,
  objectPassportReadbackPath,
  locale,
  authorHandle,
}: {
  entry: PlantObjectPage["entries"][number];
  objectId: string;
  objectPassportReadbackPath: string | null;
  locale: InterfaceLocale;
  /** The owner's registry handle; the public link hangs from it (ADR-0029 D9). */
  authorHandle: string | null;
}) {
  const actionCopy = getOwnerObjectCopy(locale).entryActions;

  if (entry.visibility === "public" && entry.public_slug) {
    return (
      <div
        data-owner-entry-controls="public"
        className="flex flex-wrap items-center gap-3"
      >
        <span className="text-caption text-text-muted">
          {actionCopy.publicAvailable}
        </span>
        {objectPassportReadbackPath ? (
          <Link
            href={objectPassportReadbackPath}
            className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
          >
            {actionCopy.openPassport}
          </Link>
        ) : null}
        <Link
          href={publicJournalEntryAddress({
            authorHandle,
            entryNumber: entry.author_entry_number,
            publicSlug: entry.public_slug,
          })}
          className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
        >
          {actionCopy.openPage}
        </Link>
        <OwnerScopedProgressiveForm
          action={deleteJournalEntryAction}
          className="flex w-full flex-col gap-3 pt-1"
        >
          <HiddenField name="entryId" value={entry.id} />
          <HiddenField name="objectId" value={objectId} />
          <Checkbox
            name="deleteAccepted"
            required
            label={actionCopy.deleteDisclosure}
          />
          <button
            type="submit"
            className={buttonVariants({
              variant: "danger",
              size: "sm",
              className: "self-start",
            })}
          >
            {actionCopy.deleteButton}
          </button>
        </OwnerScopedProgressiveForm>
      </div>
    );
  }

  return null;
}

function ProvenanceSection({
  objectId,
  provenancePanel,
  writeEnabled,
  lineageReadbackPath,
  locale,
}: {
  objectId: string;
  provenancePanel: ObjectProvenancePanel;
  writeEnabled: boolean;
  lineageReadbackPath: string | null;
  locale: InterfaceLocale;
}) {
  const provenanceCopy = getOwnerObjectCopy(locale).provenance;

  return (
    <section
      id="passport-provenance"
      className="grid min-w-0 gap-4 border-t border-border pt-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 text-text-heading">{provenanceCopy.title}</h2>
        <p className="text-body-sm text-text-muted">
          {provenanceCopy.description}
        </p>
      </div>

      {writeEnabled ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          {provenancePanel.sourceObjectOptions.length > 0 ? (
            <OwnerScopedProgressiveForm
              action={createProvenanceEdgeAction}
              className="grid min-w-0 gap-3 rounded-md border border-border p-3"
            >
              <HiddenField name="objectId" value={objectId} />
              <HiddenField name="sourceKind" value="own_object" />
              <HiddenField
                name="clientMutationId"
                value={crypto.randomUUID()}
              />
              <Field
                label={provenanceCopy.sourceObject}
                required
                className="min-w-0"
              >
                <Select name="sourcePlantObjectId">
                  {provenancePanel.sourceObjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {lineageObjectOptionLabel(option, provenanceCopy)}
                    </option>
                  ))}
                </Select>
              </Field>
              <button
                type="submit"
                className={buttonVariants({ className: "justify-self-start" })}
              >
                {provenanceCopy.recordObjectSource}
              </button>
            </OwnerScopedProgressiveForm>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-body-sm text-text-muted">
              {provenanceCopy.noSourceObject}
            </p>
          )}

          <OwnerScopedProgressiveForm
            action={createProvenanceEdgeAction}
            className="grid min-w-0 gap-3 rounded-md border border-border p-3"
          >
            <HiddenField name="objectId" value={objectId} />
            <HiddenField name="sourceKind" value="source_reference" />
            <HiddenField name="clientMutationId" value={crypto.randomUUID()} />
            <Field
              label={provenanceCopy.sourceType}
              required
              className="min-w-0"
            >
              <Select name="sourceReferenceKind" defaultValue="person">
                <option value="person">
                  {provenanceCopy.sourceTypes.person}
                </option>
                <option value="seed_packet">
                  {provenanceCopy.sourceTypes.seedPacket}
                </option>
                <option value="nursery">
                  {provenanceCopy.sourceTypes.nursery}
                </option>
                <option value="catalog_variety">
                  {provenanceCopy.sourceTypes.catalogVariety}
                </option>
                <option value="other">
                  {provenanceCopy.sourceTypes.other}
                </option>
              </Select>
            </Field>
            <Field
              label={provenanceCopy.privateSourceLabel}
              required
              className="min-w-0"
            >
              <Input
                name="sourceReferenceLabel"
                maxLength={120}
                placeholder={provenanceCopy.privateSourcePlaceholder}
              />
            </Field>
            <p className="text-caption leading-5 text-text-muted">
              {provenanceCopy.contactFree}
            </p>
            <button
              type="submit"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              {provenanceCopy.recordPrivateSource}
            </button>
          </OwnerScopedProgressiveForm>

          <OwnerScopedProgressiveForm
            action={createLineageInvitationAction}
            className="grid min-w-0 gap-3 rounded-md border border-border p-3"
          >
            <HiddenField name="objectId" value={objectId} />
            <HiddenField name="clientMutationId" value={crypto.randomUUID()} />
            <Field
              label={provenanceCopy.invitedSourceLabel}
              required
              className="min-w-0"
            >
              <Input
                name="pendingSourceLabel"
                maxLength={120}
                placeholder={provenanceCopy.invitedSourcePlaceholder}
              />
            </Field>
            <p className="text-caption leading-5 text-text-muted">
              {provenanceCopy.invitationHelp}
            </p>
            <button
              type="submit"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              {provenanceCopy.createInvite}
            </button>
          </OwnerScopedProgressiveForm>
        </div>
      ) : null}

      {provenancePanel.edges.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-body-sm text-text-muted">
          {provenanceCopy.empty}
        </p>
      ) : (
        <ol className="grid gap-3">
          {provenancePanel.edges.map((edge) => (
            <li key={edge.id} className="rounded-md border border-border p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-h4 text-text-heading">
                  {lineageEdgeTitle(edge, provenanceCopy)}
                </h3>
                <time className="text-caption text-text-muted">
                  {formatGardenWorkspaceDate(locale, edge.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-caption text-text-muted">
                {lineageConsentLabel(edge, provenanceCopy)} ·{" "}
                {lineageVisibilityLabel(edge, provenanceCopy)}
              </p>
              {edge.pendingIdentity ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <span className="text-caption text-text-muted">
                    {formatOwnerObjectTemplate(provenanceCopy.inviteState, {
                      state: lineagePendingInviteStateLabel(
                        edge.pendingIdentity.inviteState,
                        provenanceCopy,
                      ),
                    })}
                  </span>
                  {edge.pendingIdentity.inviteState === "pending" ? (
                    <Link
                      href={edge.pendingIdentity.invitePath}
                      className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
                    >
                      {provenanceCopy.openPrivateInvite}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {lineageReadbackPath ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="text-caption text-text-muted">
            {provenanceCopy.readbackAvailable}
          </span>
          <Link
            href={lineageReadbackPath}
            className="text-link hover:text-link-hover text-body-sm font-medium underline-offset-4 hover:underline"
          >
            {provenanceCopy.openReadback}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

async function recordOwnRecordRevisited(
  scope: Parameters<typeof getPlantObjectPage>[0],
  page: PlantObjectPage,
) {
  const latestEntry = page.entries[0];
  if (!latestEntry) return;

  await recordAnalyticsEventSafely(scope, {
    eventName: "own_record_revisited",
    properties: {
      followed_by_action: false,
      location_visibility_level: page.plantObject
        .location_visibility as LocationVisibility,
      variety_state: page.plantObject.variety_state as VarietyState,
    },
    spaceId: page.space.id,
    plantObjectId: page.plantObject.id,
    journalEntryId: latestEntry.id,
  });
}

async function recordProgressMomentShown(
  scope: Parameters<typeof getPlantObjectPage>[0],
  page: PlantObjectPage,
) {
  const latestEntry = page.entries[0];
  if (!latestEntry) return;

  await recordAnalyticsEventSafely(scope, {
    eventName: "progress_screen_shown",
    properties: {
      entry_scope: latestEntry.entry_scope as EntryScope,
      has_photo: page.entries.some((entry) => entry.media !== null),
      location_visibility_level: page.plantObject
        .location_visibility as LocationVisibility,
      variety_state: page.plantObject.variety_state as VarietyState,
    },
    spaceId: page.space.id,
    plantObjectId: page.plantObject.id,
    journalEntryId: latestEntry.id,
  });
}

function canResolveCatalogState(value: string) {
  return value === "unknown" || value === "free_text";
}

/**
 * The passport's own address (ADR-0029 D9) when the object has one, or the
 * legacy id path in the locale's route family when it does not.
 */
function ownPassportPath(
  page: PlantObjectPage,
  objectId: string,
  authorHandle: string | null,
  locale: InterfaceLocale,
) {
  return authorHandle && page.plantObject.public_slug
    ? publicObjectPassportPath(authorHandle, page.plantObject.public_slug)
    : localizedPath(locale, publicLineageObjectPath(objectId));
}

function getLineageReadbackPath(
  page: PlantObjectPage,
  provenancePanel: ObjectProvenancePanel,
  passportPath: string,
) {
  if (!hasActivePublicEntry(page)) return null;

  const hasConfirmedOwnObjectSource = provenancePanel.edges.some(
    (edge) =>
      edge.sourceKind === "own_object" &&
      edge.consentState === "confirmed" &&
      edge.erasureState === "active",
  );

  return hasConfirmedOwnObjectSource ? passportPath : null;
}

function hasActivePublicEntry(page: PlantObjectPage) {
  return page.entries.some(
    (entry) =>
      entry.visibility === "public" &&
      entry.lifecycle_state === "active" &&
      entry.public_slug &&
      !entry.public_gone_at,
  );
}

function lineageObjectOptionLabel(
  option: LineagePlantObjectOption,
  copy: OwnerObjectCopy["provenance"],
) {
  const variety = option.varietyText ?? copy.edge.unknownIdentity;
  return `${option.displayName} · ${variety}`;
}

function lineageEdgeTitle(
  edge: LineageProvenanceEdgeReadback,
  copy: OwnerObjectCopy["provenance"],
) {
  if (edge.sourceObject) {
    return formatOwnerObjectTemplate(copy.edge.fromObject, {
      source: lineageObjectOptionLabel(edge.sourceObject, copy),
    });
  }

  if (edge.pendingIdentity) {
    return formatOwnerObjectTemplate(copy.edge.invitationPending, {
      source: edge.pendingIdentity.displayLabel,
    });
  }

  return formatOwnerObjectTemplate(copy.edge.fromReference, {
    source:
      edge.sourcePersonMention ??
      edge.sourceReferenceLabel ??
      copy.edge.privateSource,
    kind: lineageSourceReferenceKindLabel(edge.sourceReferenceKind, copy),
  });
}

function lineageSourceReferenceKindLabel(
  value: LineageProvenanceEdgeReadback["sourceReferenceKind"],
  copy: OwnerObjectCopy["provenance"],
) {
  switch (value) {
    case "person":
      return copy.sourceTypes.person;
    case "seed_packet":
      return copy.sourceTypes.seedPacket;
    case "nursery":
      return copy.sourceTypes.nursery;
    case "catalog_variety":
      return copy.sourceTypes.catalogVariety;
    case "other":
    default:
      return copy.sourceTypes.source;
  }
}

function lineageConsentLabel(
  edge: LineageProvenanceEdgeReadback,
  copy: OwnerObjectCopy["provenance"],
) {
  if (edge.pendingIdentity?.inviteState === "pending") {
    return copy.consent.pendingInvited;
  }

  switch (edge.consentState) {
    case "confirmed":
      return copy.consent.confirmed;
    case "declined":
      return copy.consent.declined;
    case "anonymized":
      return copy.consent.anonymized;
    case "proposed":
    default:
      return copy.consent.proposed;
  }
}

function lineageVisibilityLabel(
  edge: LineageProvenanceEdgeReadback,
  copy: OwnerObjectCopy["provenance"],
) {
  if (edge.pendingIdentity?.inviteState === "pending") {
    return copy.visibility.pendingInvited;
  }

  switch (edge.consentState) {
    case "confirmed":
      return copy.visibility.confirmed;
    case "declined":
      return copy.visibility.declined;
    case "anonymized":
      return copy.visibility.anonymized;
    case "proposed":
    default:
      return copy.visibility.proposed;
  }
}

function lineagePendingInviteStateLabel(
  value: NonNullable<
    LineageProvenanceEdgeReadback["pendingIdentity"]
  >["inviteState"],
  copy: OwnerObjectCopy["provenance"],
) {
  switch (value) {
    case "claimed":
      return copy.inviteStates.claimed;
    case "declined":
      return copy.inviteStates.declined;
    case "anonymized":
      return copy.inviteStates.anonymized;
    case "pending":
    default:
      return copy.inviteStates.pending;
  }
}
