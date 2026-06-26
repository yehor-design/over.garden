import { revalidatePath } from "next/cache";

import type {
  FirstPlantEntryRequest,
  FirstPlantEntryResponse,
} from "@/lib/garden/entry-contracts";
import { requireCurrentUserId } from "@/server/auth-session";
import { createFirstPlantEntry } from "@/server/journal-repository";
import { scopedToUser } from "@/server/request-scope";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await requireCurrentUserId();
  const body = (await request
    .json()
    .catch(() => null)) as Partial<FirstPlantEntryRequest> | null;

  if (!body) {
    return Response.json(
      { error: "Entry payload is required." },
      { status: 400 },
    );
  }

  try {
    const result = await createFirstPlantEntry(scopedToUser(userId), {
      spaceName: body.spaceName ?? "",
      plantName: body.plantName ?? "",
      varietyText: body.varietyText ?? "",
      title: body.title ?? "",
      body: body.body ?? "",
      entryDate: body.entryDate ?? "",
      clientMutationId: body.clientMutationId ?? "",
      mediaAssetId: body.mediaAssetId ?? "",
    });
    const readbackUrl = `/garden/objects/${result.plantObject.id}`;

    revalidatePath("/garden");
    revalidatePath(readbackUrl);

    const response: FirstPlantEntryResponse = {
      space: {
        id: result.space.id,
        displayName: result.space.display_name,
        locationVisibility: result.space.location_visibility,
      },
      plantObject: {
        id: result.plantObject.id,
        displayName: result.plantObject.display_name,
        varietyText: result.plantObject.variety_text,
        varietyState: result.plantObject.variety_state,
        locationVisibility: result.plantObject.location_visibility,
      },
      entry: {
        id: result.entry.id,
        title: result.entry.title,
        body: result.entry.body,
        entryDate: normalizeResponseDate(result.entry.entry_date),
        clientMutationId: result.entry.client_mutation_id,
      },
      readbackUrl,
    };

    return Response.json(response);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Entry could not be saved.",
      },
      { status: 400 },
    );
  }
}

function normalizeResponseDate(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}
