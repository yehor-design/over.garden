import "server-only";

import type { AuthSecretConfiguration } from "@/lib/auth-secret";
import {
  DOCUMENT_MUTATION_GENERATION_FORM_FIELD,
  DOCUMENT_MUTATION_GENERATION_HEADER,
  type DocumentMutationAdmissionTransportResultV1,
} from "@/lib/auth/document-mutation-generation-transport";
import {
  classifyDocumentMutationGeneration,
  parseDocumentMutationGeneration,
  type DocumentMutationGenerationClassification,
} from "@/lib/auth/document-mutation-generation-contract";
import {
  getAuthoritativeCurrentSession,
  getSessionId,
} from "@/server/auth-session";
import { isDocumentMutationAdmissionEnabled } from "@/server/document-mutation-admission-config";
import { attachWriteEligibilityHint } from "@/server/pilot-write-access";
import { scopedToUser, type RequestScope } from "@/server/request-scope";

export {
  DOCUMENT_MUTATION_GENERATION_FORM_FIELD,
  DOCUMENT_MUTATION_GENERATION_HEADER,
};
export const MUTATION_ADMISSION_DEADLINE_MS = 3_000;

export type DocumentMutationAdmissionInternalResult =
  | "MATCH"
  | "OWNER_TRANSITION_CONFIRMED"
  | "SAME_OWNER_SESSION_REFRESH_REQUIRED"
  | "DOCUMENT_PROTOCOL_REFRESH_REQUIRED"
  | "INVALID_OR_TAMPERED"
  | "SIGNED_OUT"
  | "MUTATION_ADMISSION_UNAVAILABLE";

export interface DocumentMutationAdmissionDeps {
  readAuthoritativeSession: () => Promise<unknown>;
  attachWriteEligibilityHint: (scope: RequestScope) => Promise<RequestScope>;
  authSecrets?: AuthSecretConfiguration;
  featureEnabled?: boolean;
}

export interface AdmittedDocumentMutation {
  status: "admitted";
  internalResult: "MATCH";
  transportResult: "MATCH";
  scope: RequestScope;
  envelopeExpiresAtSeconds: number;
}

export interface RejectedDocumentMutation {
  status: "rejected";
  internalResult: Exclude<DocumentMutationAdmissionInternalResult, "MATCH">;
  transportResult: Exclude<DocumentMutationAdmissionTransportResultV1, "MATCH">;
  statusCode: 401 | 409 | 503;
}

export type DocumentMutationAdmission =
  | AdmittedDocumentMutation
  | RejectedDocumentMutation;

export interface AdmitDocumentMutationInput {
  transport: string | null | undefined;
  nowSeconds?: number;
  deps?: DocumentMutationAdmissionDeps;
}

const DEFAULT_DEPS: DocumentMutationAdmissionDeps = {
  readAuthoritativeSession: getAuthoritativeCurrentSession,
  attachWriteEligibilityHint,
};

export async function admitDocumentMutation(
  input: AdmitDocumentMutationInput,
): Promise<DocumentMutationAdmission> {
  const deps = input.deps ?? DEFAULT_DEPS;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);

  return settleAdmissionOnce(async (isOpen) => {
    let session: Awaited<ReturnType<typeof getAuthoritativeCurrentSession>>;
    try {
      session = (await deps.readAuthoritativeSession()) as Awaited<
        ReturnType<typeof getAuthoritativeCurrentSession>
      >;
    } catch {
      return unavailableAdmission();
    }
    if (!isOpen()) return unavailableAdmission();

    const userId = session?.user?.id;
    if (typeof userId !== "string" || userId.length === 0) {
      return rejectedAdmission("SIGNED_OUT");
    }
    const sessionId = getSessionId(session);
    if (!sessionId) return unavailableAdmission();

    if (
      deps.featureEnabled === false ||
      (deps.featureEnabled === undefined &&
        !isDocumentMutationAdmissionEnabled())
    ) {
      return admitScopedRollbackRequest({
        deps,
        isOpen,
        userId,
        sessionId,
        nowSeconds,
      });
    }

    if (!input.transport) {
      return rejectedAdmission("DOCUMENT_PROTOCOL_REFRESH_REQUIRED");
    }

    const classification = classifyDocumentMutationGeneration({
      transport: input.transport,
      ownerUserId: userId,
      sessionId,
      nowSeconds,
      authSecrets: deps.authSecrets,
    });
    if (classification !== "MATCH") {
      return rejectedAdmission(classification);
    }

    const envelope = parseDocumentMutationGeneration(input.transport);
    if (!envelope) return rejectedAdmission("INVALID_OR_TAMPERED");

    let scope: RequestScope;
    try {
      scope = await deps.attachWriteEligibilityHint(
        scopedToUser(userId, sessionId),
      );
    } catch {
      return unavailableAdmission();
    }
    if (!isOpen()) return unavailableAdmission();

    return {
      status: "admitted",
      internalResult: "MATCH",
      transportResult: "MATCH",
      scope,
      envelopeExpiresAtSeconds: envelope.expiresAtSeconds,
    };
  });
}

export function documentMutationGenerationFromRequest(
  request: Request,
): string | null {
  return request.headers.get(DOCUMENT_MUTATION_GENERATION_HEADER);
}

export function documentMutationGenerationFromFormData(
  formData: FormData,
): string | null {
  const value = formData.get(DOCUMENT_MUTATION_GENERATION_FORM_FIELD);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function documentMutationAdmissionResponse(
  admission: RejectedDocumentMutation,
): Response {
  return Response.json(
    { code: admission.transportResult },
    {
      status: admission.statusCode,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

function rejectedAdmission(
  internalResult: Exclude<DocumentMutationAdmissionInternalResult, "MATCH">,
): RejectedDocumentMutation {
  switch (internalResult) {
    case "OWNER_TRANSITION_CONFIRMED":
      return closedRejection(internalResult, "DOCUMENT_OWNER_CHANGED", 409);
    case "SAME_OWNER_SESSION_REFRESH_REQUIRED":
      return closedRejection(
        internalResult,
        "DOCUMENT_SESSION_REFRESH_REQUIRED",
        409,
      );
    case "DOCUMENT_PROTOCOL_REFRESH_REQUIRED":
    case "INVALID_OR_TAMPERED":
      return closedRejection(
        internalResult,
        "DOCUMENT_PROTOCOL_REFRESH_REQUIRED",
        409,
      );
    case "SIGNED_OUT":
      return closedRejection(internalResult, "AUTHENTICATION_REQUIRED", 401);
    case "MUTATION_ADMISSION_UNAVAILABLE":
      return unavailableAdmission();
  }
}

function unavailableAdmission(): RejectedDocumentMutation {
  return closedRejection(
    "MUTATION_ADMISSION_UNAVAILABLE",
    "MUTATION_ADMISSION_UNAVAILABLE",
    503,
  );
}

async function admitScopedRollbackRequest(input: {
  deps: DocumentMutationAdmissionDeps;
  isOpen: () => boolean;
  userId: string;
  sessionId: string;
  nowSeconds: number;
}): Promise<DocumentMutationAdmission> {
  let scope: RequestScope;
  try {
    scope = await input.deps.attachWriteEligibilityHint(
      scopedToUser(input.userId, input.sessionId),
    );
  } catch {
    return unavailableAdmission();
  }
  if (!input.isOpen()) return unavailableAdmission();
  return {
    status: "admitted",
    internalResult: "MATCH",
    transportResult: "MATCH",
    scope,
    envelopeExpiresAtSeconds: input.nowSeconds + 900,
  };
}

function closedRejection(
  internalResult: RejectedDocumentMutation["internalResult"],
  transportResult: RejectedDocumentMutation["transportResult"],
  statusCode: RejectedDocumentMutation["statusCode"],
): RejectedDocumentMutation {
  return { status: "rejected", internalResult, transportResult, statusCode };
}

function settleAdmissionOnce(
  evaluate: (isOpen: () => boolean) => Promise<DocumentMutationAdmission>,
): Promise<DocumentMutationAdmission> {
  return new Promise((resolve) => {
    let open = true;
    const finish = (result: DocumentMutationAdmission) => {
      if (!open) return;
      open = false;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      finish(unavailableAdmission());
    }, MUTATION_ADMISSION_DEADLINE_MS);

    void evaluate(() => open).then(finish, () =>
      finish(unavailableAdmission()),
    );
  });
}

export function mapDocumentMutationClassification(
  classification: Exclude<DocumentMutationGenerationClassification, "MATCH">,
): RejectedDocumentMutation {
  return rejectedAdmission(classification);
}
