import { revalidatePath } from "next/cache";

import { publicJournalEntryPath } from "@/lib/garden/public-paths";
import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";
import { authIntentRequiredResponse } from "@/server/auth-intent-http";
import { AuthenticationRequiredError } from "@/server/auth-session";
import {
  JournalAggregateConflictError,
  updateJournalEntryAggregate,
} from "@/server/journal-repository";
import {
  PilotWriteAccessError,
  requireWriteEligibleRequestScope,
} from "@/server/pilot-write-access";
import { enqueueJournalEntryIndexJob } from "@/server/search/public-journal-parity";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await context.params;

  let scope;
  try {
    scope = await requireWriteEligibleRequestScope();
  } catch (error) {
    if (error instanceof PilotWriteAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    return authIntentRequiredResponse(request, {
      action: "save",
      fallbackReturnTo: `/garden/entries/${entryId}/edit`,
      message: "Sign in to edit an entry.",
    });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    contentDocument?: unknown;
    entryDate?: string | null;
    clientMutationId?: string;
    expectedRevision?: number;
    cover?:
      | { mode: "automatic" }
      | { mode: "none" }
      | { mode: "explicit_inline"; mediaAssetId: string }
      | { mode: "separate"; mediaAssetId: string }
      | { mode: "keep_as_cover"; mediaAssetId: string }
      | null;
    mentionSelections?: unknown;
    topicTags?: unknown;
  } | null;

  if (!body) {
    return Response.json(
      { error: "Entry payload is required." },
      { status: 400 },
    );
  }

  try {
    const result = await updateJournalEntryAggregate(scope, {
      entryId,
      title: body.title ?? "",
      body: body.body ?? null,
      contentDocument: body.contentDocument,
      entryDate: body.entryDate ?? null,
      clientMutationId: body.clientMutationId ?? "",
      expectedRevision: body.expectedRevision ?? 0,
      cover: body.cover ?? null,
      mentionSelections: Array.isArray(body.mentionSelections)
        ? (body.mentionSelections as never[])
        : [],
      topicTags: body.topicTags,
    });

    revalidatePath("/garden");
    if (result.entry.plant_object_id) {
      revalidatePath(`/garden/objects/${result.entry.plant_object_id}`);
    }
    if (result.entry.public_slug && result.entry.visibility === "public") {
      const publicPath = localizedPath(
        DEFAULT_PUBLIC_LOCALE,
        publicJournalEntryPath(result.entry.public_slug),
      );
      revalidatePath(publicPath);
      if (!result.isReplay) {
        await enqueueJournalEntryIndexJob({
          journalEntryId: result.entry.id,
          userId: scope.userId,
          idempotencyKey: `journal_entry_index:${result.entry.id}:${result.entry.journal_revision}`,
        }).catch(() => undefined);
      }
    }

    return Response.json({
      entry: {
        id: result.entry.id,
        title: result.entry.title,
        body: result.entry.body,
        entryDate: result.entry.entry_date,
        clientMutationId: result.entry.client_mutation_id,
        journalRevision: Number(result.entry.journal_revision ?? 1),
        contentDocument: result.entry.content_document,
      },
      isReplay: result.isReplay,
    });
  } catch (error) {
    if (error instanceof JournalAggregateConflictError) {
      return Response.json(
        {
          error: error.message,
          code: error.code,
          currentRevision: error.currentRevision,
        },
        { status: 409 },
      );
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Entry could not be saved.",
      },
      { status: 400 },
    );
  }
}
