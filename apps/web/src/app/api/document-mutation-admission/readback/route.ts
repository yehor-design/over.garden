import {
  MAX_R2_PRESIGN_TTL_SECONDS,
  resolveR2UploadUrlTtlConfiguration,
} from "@/lib/storage";
import { DOCUMENT_MUTATION_GENERATION_PROTOCOL } from "@/lib/auth/document-mutation-generation-contract";
import { isDocumentMutationAdmissionEnabled } from "@/server/document-mutation-admission-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const ttl = resolveR2UploadUrlTtlConfiguration();
    return Response.json(
      {
        protocol: DOCUMENT_MUTATION_GENERATION_PROTOCOL,
        deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        enforcement: isDocumentMutationAdmissionEnabled()
          ? "enabled"
          : "disabled",
        r2UploadUrlTtl: {
          source: ttl.source,
          effectiveSeconds: ttl.effectiveSeconds,
          maximumSeconds: MAX_R2_PRESIGN_TTL_SECONDS,
        },
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
