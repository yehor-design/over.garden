import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import { listPendingCatalogCurationCandidates } from "@/server/catalog-curation-repository";
import { scopedToUser } from "@/server/request-scope";
import { listVarietySeedProofsForCuration } from "@/server/variety-seed-proof-repository";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  confirmCatalogCandidateAction,
  mergeCatalogCandidateAction,
  rejectCatalogCandidateAction,
  upsertVarietySeedProofAction,
} from "./actions";
import { CatalogCurationCandidateList } from "./catalog-curation-candidate-list";
import { VarietySeedProofEditor } from "./variety-seed-proof-editor";

export const dynamic = "force-dynamic";

export default async function CatalogCurationPage() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-3 border-b border-border pb-5">
          <Link href="/garden" className="text-sm text-muted-foreground">
            Garden journal
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Catalog curation
          </h1>
        </header>
        <GardenAuthPanel />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  let accessMode: ReturnType<typeof assertCatalogCuratorAccess>["mode"];

  try {
    accessMode = assertCatalogCuratorAccess(scope).mode;
  } catch {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-3 border-b border-border pb-5">
          <Link
            href="/garden"
            className={buttonVariants({
              variant: "outline",
              className: "self-start",
            })}
          >
            Back to journal
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Catalog curation
          </h1>
        </header>
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Access denied.
        </p>
      </main>
    );
  }

  const [candidates, seedProofs] = await Promise.all([
    listPendingCatalogCurationCandidates(),
    listVarietySeedProofsForCuration(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Back to journal
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Catalog curation
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              Pending: {candidates.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Seed proofs: {seedProofs.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              Gate: {accessMode === "allowlist" ? "allowlist" : "auth-only"}
            </span>
          </div>
        </div>
      </header>

      <VarietySeedProofEditor
        seedProofs={seedProofs}
        upsertAction={upsertVarietySeedProofAction}
      />

      <CatalogCurationCandidateList
        candidates={candidates}
        confirmAction={confirmCatalogCandidateAction}
        mergeAction={mergeCatalogCandidateAction}
        rejectAction={rejectCatalogCandidateAction}
      />
    </main>
  );
}
