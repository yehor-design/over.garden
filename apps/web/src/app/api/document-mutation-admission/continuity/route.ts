import {
  admitDocumentMutation,
  documentMutationAdmissionResponse,
  documentMutationGenerationFromRequest,
} from "@/server/document-mutation-admission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admission = await admitDocumentMutation({
    transport: documentMutationGenerationFromRequest(request),
  });
  if (admission.status === "rejected") {
    return documentMutationAdmissionResponse(admission);
  }
  return Response.json(
    { code: "MATCH" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
