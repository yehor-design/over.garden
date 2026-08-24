import { EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS } from "@/lib/media/ephemeral-staging-contract";
import { resolveR2AddressingReceipt } from "@/lib/r2-addressing-contract";
import { DOCUMENT_MUTATION_GENERATION_PROTOCOL } from "@/lib/auth/document-mutation-generation-contract";
import { buildAuthenticatedMutationDeploymentReceipt } from "@/server/authenticated-mutation-deployment-receipt";
import { isDocumentMutationAdmissionEnabled } from "@/server/document-mutation-admission-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json(
      {
        protocol: DOCUMENT_MUTATION_GENERATION_PROTOCOL,
        deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        enforcement: isDocumentMutationAdmissionEnabled()
          ? "enabled"
          : "disabled",
        ephemeralMediaCapabilityTtlSeconds:
          EPHEMERAL_MEDIA_CAPABILITY_TTL_SECONDS,
        r2Addressing: resolveR2AddressingReceipt(),
        authenticatedMutation: buildAuthenticatedMutationDeploymentReceipt(),
      },
      { headers: { "Cache-Control": "public, no-store" } },
    );
  } catch {
    return Response.json(
      { code: "MUTATION_ADMISSION_UNAVAILABLE" },
      {
        status: 503,
        headers: { "Cache-Control": "public, no-store" },
      },
    );
  }
}
