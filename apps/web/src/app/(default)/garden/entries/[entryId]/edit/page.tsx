import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  WorkspaceMissingRecord,
  WorkspaceSectionError,
  WorkspaceSectionSkeleton,
} from "@/components/garden/workspace-state";
import { JournalEntryEditComposer } from "@/app/(default)/garden/entries/[entryId]/edit/journal-entry-edit-composer";
import { deleteJournalEntryAction } from "@/app/(default)/garden/objects/[objectId]/actions";
import { publicJournalEntryAddress } from "@/lib/garden/public-paths";
import { getPublicAuthorHandle } from "@/server/author-handle-repository";
import { readOwnedDestination } from "@/server/owned-destination-repository";
import { normalizeJournalComposerReturnTo } from "@/lib/garden/journal-composer-return";
import { journalEntryDateInputValue } from "@/lib/garden/journal-entry-date";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { readAtomicJournalEditBaseline } from "@/server/journal-repository";
import type { RequestScope } from "@/server/request-scope";
import { resolveWorkspaceViewer } from "@/server/workspace-access";
import {
  settleSection,
  workspaceSectionDeadlineMs,
} from "@/server/workspace-failure";

import { gardenEntryEditPath, JournalEntryEditShell } from "./edit-shell";

export default async function GardenEntryEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ entryId }, query, viewer, locale] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    resolveWorkspaceViewer(),
    getRequestInterfaceLocale(),
  ]);
  const returnTo = normalizeJournalComposerReturnTo(
    firstParam(query.returnTo),
    "/garden",
  );
  const editPath = gardenEntryEditPath(entryId, returnTo);

  // Signing in is the whole point of this route, so an unauthenticated visitor
  // keeps the redirect they had. A session store that cannot answer is a
  // different thing entirely and is rendered, not redirected: bouncing someone
  // to a sign-in page because the database is down sends them to solve the
  // wrong problem (ADR-0023).
  if (viewer.status === "sign-in-required") {
    redirect(`/auth/intent?returnTo=${encodeURIComponent(editPath)}`);
  }

  if (viewer.status === "unavailable") {
    return (
      <JournalEntryEditShell locale={locale} returnTo={returnTo}>
        <WorkspaceSectionError
          locale={locale}
          failure={viewer.failure}
          retryHref={editPath}
        />
      </JournalEntryEditShell>
    );
  }

  return (
    <JournalEntryEditShell locale={locale} returnTo={returnTo}>
      <Suspense
        fallback={<WorkspaceSectionSkeleton locale={locale} rows={3} />}
      >
        <JournalEntryEditSection
          entryId={entryId}
          editPath={editPath}
          locale={locale}
          returnTo={returnTo}
          scope={viewer.scope}
        />
      </Suspense>
    </JournalEntryEditShell>
  );
}

async function JournalEntryEditSection({
  entryId,
  editPath,
  locale,
  returnTo,
  scope,
}: {
  entryId: string;
  editPath: string;
  locale: InterfaceLocale;
  returnTo: string;
  scope: RequestScope;
}) {
  const settled = await settleSection(
    () => readAtomicJournalEditBaseline(scope, entryId),
    {
      deadlineMs: workspaceSectionDeadlineMs(3),
      surface: "entry-edit",
      section: "baseline",
    },
  );

  if (settled.status === "error") {
    return (
      <WorkspaceSectionError
        locale={locale}
        failure={settled}
        retryHref={editPath}
      />
    );
  }
  if (!settled.value) {
    return <WorkspaceMissingRecord locale={locale} backHref={returnTo} />;
  }

  const baseline = settled.value;
  const destinationTarget =
    baseline.entry.entry_scope === "space" || !baseline.entry.plant_object_id
      ? ({ kind: "space", id: baseline.entry.space_id } as const)
      : ({ kind: "object", id: baseline.entry.plant_object_id } as const);
  // The destination and the entry's address name the entry; neither is
  // needed to edit it, so a slow read costs the name, never the editor.
  const [destinationSection, handleSection] = await Promise.all([
    settleSection(() => readOwnedDestination(scope, destinationTarget), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "entry-edit",
      section: "destination",
      record: false,
    }),
    settleSection(() => getPublicAuthorHandle(scope.userId), {
      deadlineMs: workspaceSectionDeadlineMs(2),
      surface: "entry-edit",
      section: "author-handle",
      record: false,
    }),
  ]);
  const destination =
    destinationSection.status === "ready" ? destinationSection.value : null;
  const authorHandle =
    handleSection.status === "ready" ? handleSection.value : null;
  const afterDeleteHref =
    destinationTarget.kind === "object"
      ? `/garden/objects/${encodeURIComponent(destinationTarget.id)}`
      : `/garden/spaces/${encodeURIComponent(destinationTarget.id)}#space-history`;
  const blockIdByMediaId = new Map(
    baseline.document.blocks.flatMap((block) =>
      block.type === "image" ? [[block.mediaAssetId, block.id] as const] : [],
    ),
  );
  const existingMedia = baseline.media.map((media) => ({
    mediaAssetId: media.mediaAssetId,
    blockId:
      blockIdByMediaId.get(media.mediaAssetId) ?? `cover_${media.mediaAssetId}`,
    generation: media.generation,
    previewUrl: media.publicUrl,
    width: media.intrinsicWidth,
    height: media.intrinsicHeight,
    focalX: media.focalX,
    focalY: media.focalY,
  }));

  return (
    <JournalEntryEditComposer
      key={`${baseline.entry.id}:${baseline.entry.journal_revision}`}
      locale={locale}
      entryId={baseline.entry.id}
      title={baseline.entry.title}
      entryDate={journalEntryDateInputValue(baseline.entry.entry_date)}
      expectedRevision={Number(baseline.entry.journal_revision ?? 1)}
      initialDocument={baseline.document}
      existingMedia={existingMedia}
      initialCoverMediaAssetId={baseline.entry.cover_media_asset_id}
      returnTo={returnTo}
      destination={destination}
      publicHref={publicJournalEntryAddress({
        authorHandle,
        entryNumber: baseline.entry.author_entry_number,
        publicSlug: baseline.entry.public_slug,
      })}
      deleteAction={deleteJournalEntryAction}
      afterDeleteHref={afterDeleteHref}
    />
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
