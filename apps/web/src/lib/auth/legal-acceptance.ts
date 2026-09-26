import { APIError } from "better-auth/api";

import { recordLegalAcceptance } from "@/server/legal-acceptance";

/**
 * The email sign-up's acceptance (ADR-0038 D2, `OVE-526`), inside Better Auth.
 *
 * The sign-up form sends `legalAccepted: true` only when its box is ticked,
 * and `/sign-up/email` refuses a body without it, whoever calls the endpoint.
 *
 * The receipt is written as soon as the account row exists, in the same
 * request. Not in the same transaction: Better Auth runs this deployment's
 * adapter without transactions (`database.transaction` is not set, and
 * turning it on would roll a sign-up back whenever its verification mail
 * fails), so a hook that threw half-way would leave an account without its
 * password instead. If the receipt cannot be written, the account is still
 * whole, the acceptance screen asks at its first sign-in, and every write is
 * refused until then (`resolveMutationScope`).
 */

export const SIGN_UP_EMAIL_PATH = "/sign-up/email";
export const LEGAL_ACCEPTANCE_REQUIRED_CODE = "LEGAL_ACCEPTANCE_REQUIRED";
/** The sign-up body field the form sets when its box is ticked. */
export const LEGAL_ACCEPTED_BODY_FIELD = "legalAccepted";

export function isLegalAcceptanceTicked(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>)[LEGAL_ACCEPTED_BODY_FIELD] === true
  );
}

/** The `hooks.before` half: no ticked box, no account. */
export function assertSignUpLegalAcceptance(context: {
  path: string;
  body?: unknown;
}) {
  if (context.path !== SIGN_UP_EMAIL_PATH) return;
  if (isLegalAcceptanceTicked(context.body)) return;
  throw APIError.from("BAD_REQUEST", {
    code: LEGAL_ACCEPTANCE_REQUIRED_CODE,
    message:
      "The terms of use, privacy policy and cookie rules must be accepted.",
  });
}

/**
 * The `databaseHooks.user.create.after` half: the receipt of the ticked box,
 * for an account the email sign-up just created. A Google account is created
 * by its callback and accepts on the acceptance screen instead.
 */
export async function recordSignUpLegalAcceptance(
  user: { id: string },
  context: { path?: string; body?: unknown } | null,
): Promise<void> {
  if (
    !context ||
    context.path !== SIGN_UP_EMAIL_PATH ||
    !isLegalAcceptanceTicked(context.body)
  ) {
    return;
  }
  try {
    await recordLegalAcceptance(user.id, "sign_up");
  } catch {
    // The account stands; the acceptance screen asks at its first sign-in.
    console.error(
      JSON.stringify({
        event: "legal_acceptance_receipt_failed",
        source: "sign_up",
      }),
    );
  }
}
