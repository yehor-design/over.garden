import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { getOperatorCurationCopy } from "@/lib/operator-curation-copy";
import { operatorRoleLabel } from "@/lib/operator-copy";
import type { AdminAccess } from "@/server/admin-access";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { assertCatalogCuratorAccess } from "@/server/catalog-curator-auth";
import {
  listCatalogAliasSuggestionsForCuration,
  listCatalogAliasSuggestionTargets,
} from "@/server/catalog-alias-curation-repository";
import { listPendingCatalogCurationCandidates } from "@/server/catalog-curation-repository";
import {
  listCatalogSourceCandidatesForReview,
  readCatalogSourceCandidateReviewSummary,
  type CatalogSourceCandidateReviewStatus,
} from "@/server/catalog-source/candidate-review-repository";
import { readCatalogEntityResolutionQaReport } from "@/server/catalog-source/entity-resolution-qa-repository";
import { listCatalogSourceProvenanceForCuration } from "@/server/catalog-source/provenance-repository";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { scopedToUser } from "@/server/request-scope";
import { listVarietySeedProofsForCuration } from "@/server/variety-seed-proof-repository";
import { GardenAuthPanel } from "../../garden-auth-panel";
import {
  approveCatalogAliasSuggestionAction,
  approveCatalogMatchSuggestionAction,
  confirmCatalogCandidateAction,
  generateCatalogAliasSuggestionsAction,
  holdCatalogSourceCandidateAction,
  mergeCatalogCandidateAction,
  promoteCatalogSourceCandidateAction,
  rejectCatalogAliasSuggestionAction,
  rejectCatalogCandidateAction,
  rejectCatalogMatchSuggestionAction,
  rejectCatalogSourceCandidateAction,
  refreshCatalogFuzzyDuplicateQaAction,
  rescanCatalogMatchSuggestionsAction,
  upsertVarietySeedProofAction,
} from "./actions";
import { CatalogAliasSuggestionReview } from "./catalog-alias-suggestion-review";
import { CatalogCurationCandidateList } from "./catalog-curation-candidate-list";
import { CatalogEntityResolutionReport } from "./catalog-entity-resolution-report";
import { CatalogSourceCandidateReviewList } from "./catalog-source-candidate-review-list";
import { CatalogSourceProvenanceList } from "./catalog-source-provenance-list";
import { VarietySeedProofEditor } from "./variety-seed-proof-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getOperatorCurationCopy(await getRequestInterfaceLocale()).page;
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    robots: { index: false, follow: false },
  };
}

type CatalogCurationPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function CatalogCurationPage({
  searchParams,
}: CatalogCurationPageProps = {}) {
  const [locale, session] = await Promise.all([
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const copy = getOperatorCurationCopy(locale);
  const userId = session?.user?.id;
  const resolvedSearchParams = await searchParams;
  const sourceStatus = normalizeSourceStatusParam(
    resolvedSearchParams?.sourceStatus,
  );
  const aliasQuery = normalizeAliasQueryParam(resolvedSearchParams?.aliasQuery);

  if (!userId) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-3 border-b border-border pb-5">
          <Link href="/garden" className="text-sm text-muted-foreground">
            {copy.page.gardenJournal}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {copy.page.title}
          </h1>
        </header>
        <GardenAuthPanel locale={locale} />
      </main>
    );
  }

  const scope = scopedToUser(userId, getSessionId(session));
  let access: AdminAccess;

  try {
    access = await assertCatalogCuratorAccess(scope);
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
            {copy.page.backToJournal}
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {copy.page.title}
          </h1>
        </header>
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {copy.page.accessDenied}
        </p>
      </main>
    );
  }

  const [
    aliasTargets,
    aliasSuggestions,
    candidates,
    seedProofs,
    sourceCandidates,
    sourceCandidateSummary,
    entityResolutionReport,
    provenanceRows,
  ] = await Promise.all([
    listCatalogAliasSuggestionTargets({ query: aliasQuery }),
    listCatalogAliasSuggestionsForCuration(),
    listPendingCatalogCurationCandidates(),
    listVarietySeedProofsForCuration(),
    listCatalogSourceCandidatesForReview({ status: sourceStatus }),
    readCatalogSourceCandidateReviewSummary(),
    readCatalogEntityResolutionQaReport(db),
    listCatalogSourceProvenanceForCuration(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-5 py-8 sm:px-8 [&>*]:min-w-0">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <Link
          href="/garden"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {copy.page.backToJournal}
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {copy.page.title}
          </h1>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.pending}: {candidates.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.pilotSignals}:{" "}
              {candidates.filter((candidate) => candidate.pilotOrigin).length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.seedProofs}: {seedProofs.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.aliasReview}: {aliasSuggestions.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.sourceCandidates}: {sourceCandidates.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.sourceRows}: {provenanceRows.length}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.gate}: {copy.page.sealedOwner}
            </span>
            <span className="rounded-md border border-border px-2 py-1">
              {copy.page.role}: {operatorRoleLabel(locale, access.role)}
            </span>
          </div>
        </div>
      </header>

      <CatalogAliasSuggestionReview
        locale={locale}
        searchQuery={aliasQuery}
        targets={aliasTargets}
        suggestions={aliasSuggestions}
        generateAction={generateCatalogAliasSuggestionsAction}
        approveAction={approveCatalogAliasSuggestionAction}
        rejectAction={rejectCatalogAliasSuggestionAction}
      />

      <VarietySeedProofEditor
        locale={locale}
        seedProofs={seedProofs}
        upsertAction={upsertVarietySeedProofAction}
      />

      <CatalogSourceCandidateReviewList
        locale={locale}
        candidates={sourceCandidates}
        summary={sourceCandidateSummary}
        activeStatus={sourceStatus}
        promoteAction={promoteCatalogSourceCandidateAction}
        holdAction={holdCatalogSourceCandidateAction}
        rejectAction={rejectCatalogSourceCandidateAction}
      />

      <CatalogEntityResolutionReport
        locale={locale}
        report={entityResolutionReport}
        refreshAction={refreshCatalogFuzzyDuplicateQaAction}
      />

      <CatalogSourceProvenanceList
        locale={locale}
        provenanceRows={provenanceRows}
      />

      <CatalogCurationCandidateList
        locale={locale}
        candidates={candidates}
        confirmAction={confirmCatalogCandidateAction}
        mergeAction={mergeCatalogCandidateAction}
        rejectAction={rejectCatalogCandidateAction}
        rescanAction={rescanCatalogMatchSuggestionsAction}
        approveSuggestionAction={approveCatalogMatchSuggestionAction}
        rejectSuggestionAction={rejectCatalogMatchSuggestionAction}
      />
    </main>
  );
}

function normalizeAliasQueryParam(
  value: string | string[] | undefined,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (candidate ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function normalizeSourceStatusParam(
  value: string | string[] | undefined,
): CatalogSourceCandidateReviewStatus | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  switch (candidate) {
    case "quarantined":
    case "held":
    case "review_needed":
    case "blocked":
    case "rejected":
    case "promoted":
      return candidate;
    default:
      return null;
  }
}
