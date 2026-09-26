import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import type { VarietyState } from "@/db/schema";
import { EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE } from "@/lib/catalog/eu-official-journal-common-catalogue";
import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import { publicCatalogEvidencePath } from "@/lib/garden/public-paths";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  getLivingObjectPassportCopy,
  ownObjectIdentityText,
} from "@/lib/living-object-passport";
import {
  formatOwnerObjectTemplate,
  getOwnerObjectCopy,
} from "@/lib/owner-object-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import type { PlantObjectPage } from "@/server/journal-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";

import {
  resolvePlantObjectCatalogAction,
  updatePlantObjectLocationAction,
} from "../actions";
import { CatalogResolveControl } from "../catalog-resolve-control";
import { LocationPrivacyControl } from "../location-privacy-control";
import { ObjectSubpageShell } from "../object-shell";
import {
  canResolveCatalogState,
  loadOwnedObject,
  ObjectSectionsNav,
  ObjectSubpageHeader,
} from "../object-sections";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getOwnerObjectCopy(locale).settingsPage.title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

/**
 * An owned object's settings (`OVE-491`, IA: the `/settings` child): where
 * its place shows, its catalogue match and the source of its data — rare
 * work, apart from reading and writing its history. Nothing here changes an
 * entry; every change is the same Server Action, validated on the server, as
 * before it moved here.
 */
export default async function GardenObjectSettingsPage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const [{ objectId }, viewer, locale] = await Promise.all([
    params,
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const path = gardenObjectSectionPath(objectId, "settings");

  if (viewer.status === "unavailable") {
    return (
      <ObjectSubpageShell
        locale={locale}
        section="settings"
        objectId={objectId}
      >
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={path}
        />
      </ObjectSubpageShell>
    );
  }
  if (viewer.status === "sign-in-required") {
    return (
      <ObjectSubpageShell
        locale={locale}
        section="settings"
        objectId={objectId}
      >
        <SignInPrompt locale={locale} next={path} />
      </ObjectSubpageShell>
    );
  }

  return (
    <ObjectSubpageShell locale={locale} section="settings" objectId={objectId}>
      <Suspense
        fallback={
          <WorkspaceSectionSkeleton
            locale={locale}
            title={getOwnerObjectCopy(locale).settingsPage.title}
            rows={3}
            media={false}
          />
        }
      >
        <ObjectSettingsSections
          locale={locale}
          objectId={objectId}
          scope={viewer.scope}
        />
      </Suspense>
    </ObjectSubpageShell>
  );
}

async function ObjectSettingsSections({
  locale,
  objectId,
  scope,
}: {
  locale: InterfaceLocale;
  objectId: string;
  scope: RequestScope;
}) {
  const ownerCopy = getOwnerObjectCopy(locale);
  const settled = await loadOwnedObject(scope, objectId, "object-settings");

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={ownerCopy.settingsPage.title}
        retryHref={gardenObjectSectionPath(objectId, "settings")}
      />
    );
  }
  if (!settled.value) return <WorkspaceMissingRecord locale={locale} />;

  const { page, provenancePanel } = settled.value;
  const object = page.plantObject;

  return (
    <>
      <ObjectSubpageHeader
        locale={locale}
        object={{
          id: object.id,
          displayName: object.display_name,
          objectKind: object.object_kind,
          species:
            object.catalog_canonical_name ??
            ownObjectIdentityText(object) ??
            (object.variety_state === "selected" ? object.variety_text : null),
        }}
        space={{ id: page.space.id, displayName: page.space.display_name }}
      />
      <ObjectSectionsNav
        locale={locale}
        objectId={object.id}
        current="settings"
        provenanceCount={provenancePanel.edges.length}
      />
      <p className="max-w-prose text-body-sm text-text-muted">
        {ownerCopy.settingsPage.description}
      </p>

      <div id="passport-management" className="grid min-w-0 gap-5">
        <div id="passport-privacy" className="min-w-0">
          <LocationPrivacyControl
            locale={locale}
            objectId={object.id}
            currentLocationVisibility={object.location_visibility}
            currentCoarseRegionCode={object.coarse_region_code}
            action={updatePlantObjectLocationAction}
          />
        </div>

        <div id="passport-catalog" className="min-w-0">
          {canResolveCatalogState(object.variety_state) ? (
            <CatalogResolveControl
              locale={locale}
              objectId={object.id}
              objectKind={object.object_kind}
              currentVarietyText={ownObjectIdentityText(object)}
              currentVarietyState={object.variety_state as VarietyState}
              action={resolvePlantObjectCatalogAction}
            />
          ) : (
            <CatalogMatchReadback page={page} locale={locale} />
          )}
        </div>

        <SourceCredit page={page} locale={locale} />
      </div>
    </>
  );
}

/**
 * A matched object says what it is matched to. The server resolves only an
 * object without a catalogue identity, so there is nothing to change here.
 */
function CatalogMatchReadback({
  page,
  locale,
}: {
  page: PlantObjectPage;
  locale: InterfaceLocale;
}) {
  const copy = getOwnerObjectCopy(locale).catalog;
  const passportCopy = getLivingObjectPassportCopy(locale);
  const object = page.plantObject;
  const value =
    object.catalog_canonical_name ?? object.variety_text ?? copy.noName;
  const catalogPath =
    object.catalog_public_slug && object.catalogKind
      ? publicCatalogEvidencePath({
          catalogKind: object.catalogKind,
          publicSlug: object.catalog_public_slug,
          speciesSlug: object.catalog_species_slug,
        })
      : null;

  return (
    <section
      data-catalog-match="fixed"
      className="grid min-w-0 gap-2 rounded-lg border border-border p-4"
    >
      <h2 className="text-h3 text-text-heading">{copy.fixedTitle}</h2>
      <p className="text-body-sm text-text">
        {formatOwnerObjectTemplate(copy.fixed, { value })}
      </p>
      {catalogPath ? (
        <Link
          href={catalogPath}
          className="text-link hover:text-link-hover w-fit text-body-sm font-medium underline-offset-4 hover:underline"
        >
          {passportCopy.openCatalog.replace("{name}", value)}
        </Link>
      ) : null}
    </section>
  );
}

function SourceCredit({
  page,
  locale,
}: {
  page: PlantObjectPage;
  locale: InterfaceLocale;
}) {
  const copy = getOwnerObjectCopy(locale).source;
  const credit = page.plantObject.source_credit;
  if (!credit) return null;
  const caveat =
    credit.sourceSlug === EU_OFFICIAL_JOURNAL_COMMON_CATALOGUE_PRODUCT_SOURCE
      ? copy.euLegalCaveat
      : null;

  return (
    <div className="grid gap-1 border-t border-border pt-4 text-caption leading-5 text-text-muted">
      <p>
        {formatOwnerObjectTemplate(copy.summary, {
          sourceName: credit.sourceName,
        })}
      </p>
      {caveat ? <p>{caveat}</p> : null}
      <Link
        href={credit.sourceUrl}
        className="text-link hover:text-link-hover w-fit font-medium underline-offset-4 hover:underline"
      >
        {copy.open}
      </Link>
    </div>
  );
}
