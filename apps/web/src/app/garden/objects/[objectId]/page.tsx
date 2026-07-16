import Link from "next/link";
import { notFound } from "next/navigation";

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
  buildAuthIntentAnchor,
  normalizeAuthIntentResumeAction,
  normalizeAuthIntentResumeControl,
  type AuthIntentAction,
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
  publicJournalEntryPath,
  publicLineageObjectPath,
} from "@/lib/garden/public-paths";
import { localizedPath } from "@/lib/public-localization";
import {
  resolveVisualJournalCreationResultScenario,
  resolveVisualJournalCreationScenario,
} from "@/lib/visual-fixtures/journal-creation-scenarios";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { createAuthIntentControlRef } from "@/server/auth-intent-control";
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
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { buildOwnerObjectPassportPresentation } from "@/server/owner-object-passport-presentation";
import { scopedToUser } from "@/server/request-scope";
import { ClosedPilotWriteCallout } from "../../closed-pilot-write-callout";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  archiveJournalEntryAction,
  createLineageInvitationAction,
  createProvenanceEdgeAction,
  publishJournalEntryAction,
  resolvePlantObjectCatalogAction,
  updatePlantObjectLocationAction,
} from "./actions";
import { CatalogResolveControl } from "./catalog-resolve-control";
import { FollowUpEntryComposer } from "./follow-up-entry-composer";
import { FollowUpValuePulse } from "./follow-up-value-pulse";
import { LocationPrivacyControl } from "./location-privacy-control";
import { ObjectProgressMoment } from "./object-progress-moment";
import { SaveProgressMoment } from "../../save-progress-moment";

export const dynamic = "force-dynamic";

interface PlantObjectPageProps {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{
    valuePulse?: string;
    entryId?: string;
    saveProgress?: string | string[];
    authIntent?: string | string[];
    authControl?: string | string[];
    visualCreate?: string | string[];
    visualCreateResult?: string | string[];
  }>;
}

export default async function PlantObjectReadbackPage({
  params,
  searchParams,
}: PlantObjectPageProps) {
  const [{ objectId }, query, session, locale] = await Promise.all([
    params,
    searchParams,
    getCurrentSession(),
    getRequestInterfaceLocale(),
  ]);
  const copy = getInterfaceCopy(locale);
  const workspaceCopy = getGardenWorkspaceCopy(locale);
  const ownerCopy = getOwnerObjectCopy(locale);
  const resumeAction = normalizeAuthIntentResumeAction(query.authIntent);
  const resumeControl = normalizeAuthIntentResumeControl(query.authControl);
  const visualCreationCandidate = resolveVisualJournalCreationScenario(
    query.visualCreate,
    "follow-up",
    process.env,
  );
  const visualCreationScenario =
    visualCreationCandidate?.objectId === objectId
      ? visualCreationCandidate
      : null;
  const visualCreationResultScenario =
    resolveVisualJournalCreationResultScenario(
      query.visualCreateResult,
      objectId,
      process.env,
    );
  const fixtureScenario =
    visualCreationScenario ?? visualCreationResultScenario;
  const userId = fixtureScenario?.ownerActorId ?? session?.user?.id;

  if (!userId) {
    return (
      <main
        lang={locale}
        className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8"
      >
        <header className="flex flex-col gap-2 border-b border-border pb-5">
          <Link href="/garden" className="text-sm text-muted-foreground">
            {copy.object.gardenJournal}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {copy.object.livingObject}
          </h1>
        </header>
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  const scope = scopedToUser(
    userId,
    fixtureScenario ? null : getSessionId(session),
  );
  const writeAccess = fixtureScenario
    ? { invited: true }
    : await resolvePilotWriteAccess(scope);
  const page = await getPlantObjectPage(scope, objectId);
  if (!page) notFound();
  const provenancePanel = await getObjectProvenancePanel(scope, objectId);
  if (!provenancePanel) notFound();
  if (!fixtureScenario) {
    await recordOwnRecordRevisited(scope, page);
  }
  const showProgressMoment = isObjectProgressMomentEligible(
    page.entries.length,
  );
  if (showProgressMoment && !fixtureScenario) {
    await recordProgressMomentShown(scope, page);
  }

  const today = fixtureScenario
    ? "2026-07-12"
    : new Date().toISOString().slice(0, 10);
  const saveProgressKind = normalizeSaveProgressMomentKind(query.saveProgress);
  const sourceAttributionCaveat =
    page.plantObject.source_credit?.sourceSlug ===
    EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE
      ? ownerCopy.source.euLegalCaveat
      : null;
  const lineageReadbackPathValue = getLineageReadbackPath(
    page,
    provenancePanel,
    objectId,
  );
  const lineageReadbackPath = lineageReadbackPathValue
    ? localizedPath(locale, lineageReadbackPathValue)
    : null;
  const objectPassportReadbackPath = hasActivePublicEntry(page)
    ? localizedPath(locale, publicLineageObjectPath(objectId))
    : null;
  const valuePulseJournalEntryId =
    query.valuePulse === "1" && typeof query.entryId === "string"
      ? query.entryId.trim()
      : "";
  const valuePulsePrompt =
    valuePulseJournalEntryId.length > 0
      ? await resolveFollowUpValuePulsePrompt(scope, {
          plantObjectId: objectId,
          journalEntryId: valuePulseJournalEntryId,
        })
      : { eligible: false };
  const presentation = buildOwnerObjectPassportPresentation(
    page,
    provenancePanel,
    locale,
  );
  const entriesById = new Map(page.entries.map((entry) => [entry.id, entry]));

  return (
    <main
      lang={locale}
      data-visual-creation-result={visualCreationResultScenario?.id}
      className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-4 sm:px-6 sm:py-5"
    >
      <AuthIntentFocus action={resumeAction} control={resumeControl} />
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
          }))}
        />
      ) : null}

      <section
        id="follow-up-composer"
        className="grid gap-4 border-t border-border pt-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {ownerCopy.followUpSection.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ownerCopy.followUpSection.description}
          </p>
        </div>

        {writeAccess.invited ? (
          <FollowUpEntryComposer
            ownerUserId={userId}
            locale={locale}
            objectId={objectId}
            objectDisplayName={page.plantObject.display_name}
            objectKind={page.plantObject.object_kind}
            today={today}
            initialClientMutationId={crypto.randomUUID()}
            visualScenario={visualCreationScenario}
          />
        ) : (
          <ClosedPilotWriteCallout context="follow-up" locale={locale} />
        )}
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
              requiresFirstPublicationDisclosure={
                !page.hasPriorPublicationDisclosure
              }
              resumeAction={resumeAction}
              resumeControl={resumeControl}
              locale={locale}
            />
          ) : null;
        }}
      />

      <section
        id="passport-management"
        className="grid gap-5 border-t border-border pt-5"
      >
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            {ownerCopy.management.eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
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
              currentVarietyText={page.plantObject.variety_text}
              currentVarietyState={
                page.plantObject.variety_state as VarietyState
              }
              action={resolvePlantObjectCatalogAction}
            />
          </div>
        ) : null}

        {page.plantObject.source_credit ? (
          <div className="grid gap-1 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            <p>
              {formatOwnerObjectTemplate(ownerCopy.source.summary, {
                sourceName: page.plantObject.source_credit.sourceName,
              })}
            </p>
            {sourceAttributionCaveat ? <p>{sourceAttributionCaveat}</p> : null}
            <Link
              href={page.plantObject.source_credit.sourceUrl}
              className="w-fit font-medium text-primary underline-offset-4 hover:underline"
            >
              {ownerCopy.source.open}
            </Link>
          </div>
        ) : null}
      </section>

      <ProvenanceSection
        objectId={objectId}
        provenancePanel={provenancePanel}
        writeEnabled={writeAccess.invited}
        lineageReadbackPath={lineageReadbackPath}
        locale={locale}
      />
    </main>
  );
}

function OwnerEntryActions({
  entry,
  objectId,
  objectPassportReadbackPath,
  requiresFirstPublicationDisclosure,
  resumeAction,
  resumeControl,
  locale,
}: {
  entry: PlantObjectPage["entries"][number];
  objectId: string;
  objectPassportReadbackPath: string | null;
  requiresFirstPublicationDisclosure: boolean;
  resumeAction: AuthIntentAction | null;
  resumeControl: string | null;
  locale: InterfaceLocale;
}) {
  const actionCopy = getOwnerObjectCopy(locale).entryActions;

  if (entry.lifecycle_state === "archived") {
    return (
      <div data-owner-entry-controls="archived" className="grid gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          {actionCopy.archivedTitle}
        </span>
        {entry.public_gone_at ? (
          <span className="text-xs text-muted-foreground">
            {actionCopy.archivedGone}
          </span>
        ) : null}
      </div>
    );
  }

  if (entry.visibility === "public" && entry.public_slug) {
    return (
      <div
        data-owner-entry-controls="public"
        className="flex flex-wrap items-center gap-3"
      >
        <span className="text-xs text-muted-foreground">
          {actionCopy.publicAvailable}
        </span>
        {objectPassportReadbackPath ? (
          <Link
            href={objectPassportReadbackPath}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {actionCopy.openPassport}
          </Link>
        ) : null}
        <Link
          href={localizedPath(
            locale,
            publicJournalEntryPath(entry.public_slug),
          )}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {actionCopy.openPage}
        </Link>
        <form
          action={archiveJournalEntryAction}
          className="flex w-full flex-col gap-3 pt-1"
        >
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="objectId" value={objectId} />
          <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <input
              type="checkbox"
              name="archiveAccepted"
              required
              className="mt-1 size-4 rounded border-border"
            />
            <span>{actionCopy.archiveDisclosure}</span>
          </label>
          <button
            type="submit"
            className={buttonVariants({
              variant: "destructive",
              size: "sm",
              className: "self-start",
            })}
          >
            {actionCopy.archiveButton}
          </button>
        </form>
      </div>
    );
  }

  const publishControl = createAuthIntentControlRef("publish", entry.id);
  const resumesThisPublish =
    resumeAction === "publish" && resumeControl === publishControl;

  return (
    <form
      data-owner-entry-controls="private"
      action={publishJournalEntryAction}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="entryId" value={entry.id} />
      <input type="hidden" name="objectId" value={objectId} />
      {requiresFirstPublicationDisclosure ? (
        <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <input
            type="checkbox"
            name="publicationDisclosureAccepted"
            required
            className="mt-1 size-4 rounded border-border"
          />
          <span>
            {actionCopy.publicationLead} {actionCopy.publicationMedia}{" "}
            {actionCopy.publicationPilot}{" "}
            <Link
              href={localizedPath(locale, "/first-publication-disclosure")}
              className="text-primary underline-offset-4 hover:underline"
            >
              {actionCopy.readDisclosure}
            </Link>
            .
          </span>
        </label>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          {actionCopy.reviewed}
        </p>
      )}
      <button
        id={
          resumesThisPublish
            ? buildAuthIntentAnchor("publish", publishControl)
            : undefined
        }
        data-auth-intent-control="publish"
        data-auth-intent-control-ref={publishControl}
        autoFocus={resumesThisPublish}
        type="submit"
        className={buttonVariants({ size: "sm", className: "self-start" })}
      >
        {actionCopy.publishButton}
      </button>
    </form>
  );
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
        <h2 className="text-lg font-semibold text-foreground">
          {provenanceCopy.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {provenanceCopy.description}
        </p>
      </div>

      {writeEnabled ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          {provenancePanel.sourceObjectOptions.length > 0 ? (
            <form
              action={createProvenanceEdgeAction}
              className="grid min-w-0 gap-3 rounded-md border border-border p-3"
            >
              <input type="hidden" name="objectId" value={objectId} />
              <input type="hidden" name="sourceKind" value="own_object" />
              <input
                type="hidden"
                name="clientMutationId"
                value={crypto.randomUUID()}
              />
              <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
                {provenanceCopy.sourceObject}
                <select
                  name="sourcePlantObjectId"
                  required
                  className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {provenancePanel.sourceObjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {lineageObjectOptionLabel(option, provenanceCopy)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className={buttonVariants({ className: "justify-self-start" })}
              >
                {provenanceCopy.recordObjectSource}
              </button>
            </form>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              {provenanceCopy.noSourceObject}
            </p>
          )}

          <form
            action={createProvenanceEdgeAction}
            className="grid min-w-0 gap-3 rounded-md border border-border p-3"
          >
            <input type="hidden" name="objectId" value={objectId} />
            <input type="hidden" name="sourceKind" value="source_reference" />
            <input
              type="hidden"
              name="clientMutationId"
              value={crypto.randomUUID()}
            />
            <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
              {provenanceCopy.sourceType}
              <select
                name="sourceReferenceKind"
                required
                className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
                defaultValue="person"
              >
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
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
              {provenanceCopy.privateSourceLabel}
              <input
                name="sourceReferenceLabel"
                required
                maxLength={120}
                className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder={provenanceCopy.privateSourcePlaceholder}
              />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              {provenanceCopy.contactFree}
            </p>
            <button
              type="submit"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              {provenanceCopy.recordPrivateSource}
            </button>
          </form>

          <form
            action={createLineageInvitationAction}
            className="grid min-w-0 gap-3 rounded-md border border-border p-3"
          >
            <input type="hidden" name="objectId" value={objectId} />
            <input
              type="hidden"
              name="clientMutationId"
              value={crypto.randomUUID()}
            />
            <label className="grid min-w-0 gap-1 text-sm font-medium text-foreground">
              {provenanceCopy.invitedSourceLabel}
              <input
                name="pendingSourceLabel"
                required
                maxLength={120}
                className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder={provenanceCopy.invitedSourcePlaceholder}
              />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              {provenanceCopy.invitationHelp}
            </p>
            <button
              type="submit"
              className={buttonVariants({ className: "justify-self-start" })}
            >
              {provenanceCopy.createInvite}
            </button>
          </form>
        </div>
      ) : (
        <ClosedPilotWriteCallout context="follow-up" locale={locale} />
      )}

      {provenancePanel.edges.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          {provenanceCopy.empty}
        </p>
      ) : (
        <ol className="grid gap-3">
          {provenancePanel.edges.map((edge) => (
            <li key={edge.id} className="rounded-md border border-border p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {lineageEdgeTitle(edge, provenanceCopy)}
                </h3>
                <time className="text-xs text-muted-foreground">
                  {formatGardenWorkspaceDate(locale, edge.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {lineageConsentLabel(edge, provenanceCopy)} ·{" "}
                {lineageVisibilityLabel(edge, provenanceCopy)}
              </p>
              {edge.pendingIdentity ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
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
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
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
          <span className="text-xs text-muted-foreground">
            {provenanceCopy.readbackAvailable}
          </span>
          <Link
            href={lineageReadbackPath}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
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
  return value === "unknown" || value === "user_added";
}

function getLineageReadbackPath(
  page: PlantObjectPage,
  provenancePanel: ObjectProvenancePanel,
  objectId: string,
) {
  if (!hasActivePublicEntry(page)) return null;

  const hasConfirmedOwnObjectSource = provenancePanel.edges.some(
    (edge) =>
      edge.sourceKind === "own_object" &&
      edge.consentState === "confirmed" &&
      edge.erasureState === "active",
  );

  return hasConfirmedOwnObjectSource ? publicLineageObjectPath(objectId) : null;
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
    source: edge.sourceReferenceLabel ?? copy.edge.privateSource,
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
