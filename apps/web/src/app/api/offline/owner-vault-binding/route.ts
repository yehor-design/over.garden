import { getCurrentSession } from "@/server/auth-session";
import { createOfflineOwnerVaultBindingReceipt } from "@/server/offline-owner-vault-binding";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET() {
  const session = await getCurrentSession();
  const ownerUserId = session?.user?.id;
  const sessionId = session?.session?.id;

  if (typeof ownerUserId !== "string" || typeof sessionId !== "string") {
    return Response.json(
      { error: "authentication_required" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  try {
    return Response.json(
      createOfflineOwnerVaultBindingReceipt({ ownerUserId, sessionId }),
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "authentication_required" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
}
