"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { gardenSpacePath } from "@/lib/garden/space-page";
import {
  normalizeSpaceName,
  normalizeSpaceSetupReturnTo,
  spaceSetupReturnHref,
  validateSpaceSetup,
  type CreatedSpace,
  type SpaceSetupFieldError,
} from "@/lib/garden/space-setup";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import { createOwnedSpace } from "@/server/space-repository";

export type CreateSpaceFormState =
  | undefined
  | { mutationScope: string }
  | { status: "invalid"; errors: Partial<Record<"name" | "region", SpaceSetupFieldError>> }
  | { status: "duplicate"; existing: CreatedSpace }
  | { status: "conflict" }
  | { status: "failed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The space stepper's first step without JavaScript (ADR-0035 D1, OVE-523):
 * the name alone creates the space, hidden region, no photo — the photo step
 * needs the editor, and a photo can be added later in the space's settings.
 * `(previousState, formData)`, so the form's endpoint is this Server Action
 * itself and it works before the bundle does (ADR-0024 D3). The request id is
 * the page's, so a second post of the same form reads back the first space.
 */
export async function createSpaceFormAction(
  _previousState: unknown,
  formData: FormData,
): Promise<CreateSpaceFormState> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
  });
  if (admission.status === "rejected") return { mutationScope: admission.code };

  const requestId = String(formData.get("requestId") ?? "").toLowerCase();
  if (!UUID.test(requestId)) return { status: "failed" };
  const rawReturnTo = formData.get("returnTo");
  const returnTo =
    typeof rawReturnTo === "string" && rawReturnTo
      ? normalizeSpaceSetupReturnTo(rawReturnTo)
      : null;
  const errors = validateSpaceSetup({
    displayName: formData.get("displayName"),
    locationVisibility: "hidden",
    coarseRegionCode: null,
  });
  if (Object.keys(errors).length > 0) return { status: "invalid", errors };

  let created: CreatedSpace;
  try {
    const outcome = await createOwnedSpace(admission.scope, {
      requestId,
      displayName: normalizeSpaceName(formData.get("displayName")),
      locationVisibility: "hidden",
      coarseRegionCode: null,
      allowDuplicateName: formData.get("allowDuplicateName") === "1",
      photo: null,
    });
    if (outcome.status === "duplicate_name") {
      return { status: "duplicate", existing: outcome.existing };
    }
    if (outcome.status === "conflict") return { status: "conflict" };
    created = outcome.space;
  } catch {
    return { status: "failed" };
  }
  revalidatePath("/garden");
  redirect(returnTo ? spaceSetupReturnHref(returnTo, created.id) : gardenSpacePath(created.id));
}
