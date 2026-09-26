"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { LEGAL_ACCEPTANCE_DEFAULT_NEXT } from "@/lib/legal/legal-acceptance-href";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import {
  deleteDeclinedNewAccount,
  isDeclinableNewAccount,
  recordLegalAcceptance,
} from "@/server/legal-acceptance";
import {
  ownerUserIdFromFormData,
  resolveMutationScope,
} from "@/server/mutation-scope";
import {
  describeWorkspaceFailure,
  recordWorkspaceSectionFailure,
} from "@/server/workspace-failure";

/**
 * The acceptance screen's two answers (ADR-0038 D2, `OVE-526`). Both are
 * plain form posts that end in a redirect, so the screen works before and
 * without JavaScript (ADR-0024 D3).
 */
export interface LegalAcceptanceFormState {
  status: "idle" | "failed";
}

function nextFrom(formData: FormData): string {
  return normalizeInternalReturnPath(
    formData.get("next"),
    LEGAL_ACCEPTANCE_DEFAULT_NEXT,
  );
}

async function admittedUserId(formData: FormData): Promise<string> {
  const admission = await resolveMutationScope({
    expectedOwnerUserId: ownerUserIdFromFormData(formData),
    authoritative: true,
    // This is the acceptance itself.
    legalAcceptance: "exempt",
  });
  if (admission.status === "rejected") {
    // Signed out meanwhile, or another account in this browser: sign in, and
    // the proxy asks again on the way, for whoever that is.
    redirect(buildSignInHref({ returnTo: nextFrom(formData) }));
  }
  return admission.scope.userId;
}

/** «Прийняти»: the receipt, then where the person was going. */
export async function acceptLegalDocumentsAction(
  _previous: LegalAcceptanceFormState,
  formData: FormData,
): Promise<LegalAcceptanceFormState> {
  const userId = await admittedUserId(formData);
  try {
    await recordLegalAcceptance(userId, "acceptance_screen");
  } catch (error) {
    recordWorkspaceSectionFailure(describeWorkspaceFailure(error), {
      surface: "auth_terms",
      section: "legal_acceptance",
    });
    return { status: "failed" };
  }
  redirect(nextFrom(formData));
}

/**
 * «Не приймаю»: signed out, and a just-created account that never accepted
 * is deleted with it (`isDeclinableNewAccount`); an older account keeps
 * everything and meets the same question at its next sign-in.
 */
export async function declineLegalDocumentsAction(
  _previous: LegalAcceptanceFormState,
  formData: FormData,
): Promise<LegalAcceptanceFormState> {
  const userId = await admittedUserId(formData);
  const deletes = await isDeclinableNewAccount(userId).catch(() => false);
  try {
    await auth.api.signOut({ headers: await headers() });
    if (deletes) await deleteDeclinedNewAccount(userId);
  } catch (error) {
    recordWorkspaceSectionFailure(describeWorkspaceFailure(error), {
      surface: "auth_terms",
      section: "legal_acceptance",
    });
    return { status: "failed" };
  }
  redirect("/");
}
