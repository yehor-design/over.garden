"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createFirstPlantEntry } from "@/server/journal-repository";
import { requireCurrentUserId } from "@/server/auth-session";
import { scopedToUser } from "@/server/request-scope";

export async function createFirstPlantEntryAction(formData: FormData) {
  const userId = await requireCurrentUserId();
  const scope = scopedToUser(userId);
  const result = await createFirstPlantEntry(scope, {
    spaceName: String(formData.get("spaceName") ?? ""),
    plantName: String(formData.get("plantName") ?? ""),
    varietyText: String(formData.get("varietyText") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    entryDate: String(formData.get("entryDate") ?? ""),
    clientMutationId: String(
      formData.get("clientMutationId") || crypto.randomUUID(),
    ),
  });

  revalidatePath("/garden");
  revalidatePath(`/garden/objects/${result.plantObject.id}`);
  redirect(`/garden/objects/${result.plantObject.id}`);
}
