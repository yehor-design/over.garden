import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInPrompt } from "@/app/(default)/auth/sign-in-prompt";
import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { gardenObjectSectionPath } from "@/lib/garden/object-pages";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerObjectCopy } from "@/lib/owner-object-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";

import { ObjectSubpageShell } from "../object-shell";
import {
  getLineageReadbackPath,
  loadOwnedObject,
  loadOwnerAuthorHandle,
  ObjectSectionsNav,
  ObjectSubpageHeader,
  ownPassportPath,
} from "../object-sections";
import { ProvenanceSection } from "../provenance-section";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestInterfaceLocale();
  return {
    title: `${getOwnerObjectCopy(locale).provenancePage.title} | OverGarden`,
    robots: { index: false, follow: false },
  };
}

/**
 * Where an owned object came from (`OVE-491`, IA: the `/provenance` child):
 * what is recorded, then the three ways to record a source. Only objects of
 * the same kind are offered as a source, and the server refuses any other.
 */
export default async function GardenObjectProvenancePage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const [{ objectId }, viewer, locale] = await Promise.all([
    params,
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const path = gardenObjectSectionPath(objectId, "provenance");

  if (viewer.status === "unavailable") {
    return (
      <ObjectSubpageShell
        locale={locale}
        section="provenance"
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
        section="provenance"
        objectId={objectId}
      >
        <SignInPrompt locale={locale} next={path} />
      </ObjectSubpageShell>
    );
  }

  return (
    <ObjectSubpageShell
      locale={locale}
      section="provenance"
      objectId={objectId}
    >
      <Suspense
        fallback={
          <WorkspaceSectionSkeleton
            locale={locale}
            title={getOwnerObjectCopy(locale).provenancePage.title}
            rows={3}
            media={false}
          />
        }
      >
        <ObjectProvenanceSections
          locale={locale}
          objectId={objectId}
          scope={viewer.scope}
        />
      </Suspense>
    </ObjectSubpageShell>
  );
}

async function ObjectProvenanceSections({
  locale,
  objectId,
  scope,
}: {
  locale: InterfaceLocale;
  objectId: string;
  scope: RequestScope;
}) {
  const settled = await loadOwnedObject(scope, objectId, "object-provenance");

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        title={getOwnerObjectCopy(locale).provenancePage.title}
        retryHref={gardenObjectSectionPath(objectId, "provenance")}
      />
    );
  }
  if (!settled.value) return <WorkspaceMissingRecord locale={locale} />;

  const { page, provenancePanel } = settled.value;
  const object = page.plantObject;
  const authorHandle = await loadOwnerAuthorHandle(scope, "object-provenance");
  const passportPath = ownPassportPath(page, object.id, authorHandle, locale);

  return (
    <>
      <ObjectSubpageHeader
        locale={locale}
        object={{
          id: object.id,
          displayName: object.display_name,
          objectKind: object.object_kind,
          species: object.catalog_canonical_name ?? object.variety_text,
        }}
        space={{ id: page.space.id, displayName: page.space.display_name }}
      />
      <ObjectSectionsNav
        locale={locale}
        objectId={object.id}
        current="provenance"
        provenanceCount={provenancePanel.edges.length}
      />
      <ProvenanceSection
        objectId={object.id}
        subjectName={object.display_name}
        objectKind={object.object_kind}
        provenancePanel={provenancePanel}
        writeEnabled
        lineageReadbackPath={getLineageReadbackPath(
          page,
          provenancePanel,
          passportPath,
        )}
        locale={locale}
      />
    </>
  );
}
