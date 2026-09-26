import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GlobeIcon as Globe } from "@/components/icons/Globe";
import { ImageIcon } from "@/components/icons/Image";
import { ShieldCheckIcon as ShieldCheck } from "@/components/icons/ShieldCheck";
import { Link } from "@/components/ui/link";
import { getLegalAcceptanceCopy } from "@/lib/legal/legal-acceptance-copy";
import { LEGAL_ACCEPTANCE_DEFAULT_NEXT } from "@/lib/legal/legal-acceptance-href";
import {
  getLegalDocument,
  LEGAL_DOCUMENT_PATHS,
  type LegalDocumentKey,
} from "@/lib/legal/legal-documents";
import { normalizeInternalReturnPath } from "@/lib/navigation/internal-return-path";
import { buildSignInHref } from "@/lib/navigation/sign-in-href";
import { localizedPath } from "@/lib/public-localization";
import { getCurrentSession } from "@/server/auth-session";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import {
  isDeclinableNewAccount,
  readLegalAcceptanceState,
} from "@/server/legal-acceptance";
import { AuthFrame } from "../auth-frame";
import {
  acceptLegalDocumentsAction,
  declineLegalDocumentsAction,
} from "./actions";
import { LegalAcceptanceForms } from "./legal-acceptance-forms";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getLegalAcceptanceCopy(await getRequestInterfaceLocale());
  return {
    title: copy.screen.metadataTitle,
    robots: { index: false, follow: false },
  };
}

const DOCUMENTS: readonly LegalDocumentKey[] = ["terms", "privacy", "cookies"];

/** What is public, what the photos do, and that the data stays the reader's. */
const POINT_ICONS = [Globe, ImageIcon, ShieldCheck] as const;

/**
 * The acceptance screen (ADR-0038 D2, `OVE-526`): what a Google sign-in, and
 * an account from before the documents existed, meet before the workspace;
 * and what an account meets again, once, when a document changes. The proxy
 * sends a workspace page here and sends an account that has accepted onward,
 * so this page only draws the question.
 */
export default async function LegalAcceptanceRoute({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>;
}) {
  const [params, locale, session] = await Promise.all([
    searchParams ?? Promise.resolve<{ next?: string | string[] }>({}),
    getRequestInterfaceLocale(),
    getCurrentSession(),
  ]);
  const next = normalizeInternalReturnPath(
    Array.isArray(params.next) ? params.next[0] : params.next,
    LEGAL_ACCEPTANCE_DEFAULT_NEXT,
  );
  const userId = session?.user?.id;
  // Signed out: sign in, then on to where the reader was going; the proxy
  // brings an account without a receipt back here on the way.
  if (!userId) redirect(buildSignInHref({ returnTo: next }));
  const [state, declineDeletesAccount] = await Promise.all([
    readLegalAcceptanceState(userId),
    isDeclinableNewAccount(userId).catch(() => false),
  ]);
  if (state === "current") redirect(next);

  const copy = getLegalAcceptanceCopy(locale);
  const updated = state === "outdated";

  return (
    <AuthFrame
      locale={locale}
      screen="terms"
      title={updated ? copy.screen.updatedTitle : copy.screen.title}
      description={updated ? copy.screen.updatedLead : copy.screen.lead}
    >
      <section aria-labelledby="legal-acceptance-points" className="grid gap-3">
        <h2 id="legal-acceptance-points" className="text-h4 text-text-heading">
          {copy.screen.pointsLabel}
        </h2>
        <ul className="grid list-none gap-5">
          {copy.screen.points.map((point, index) => {
            const Icon = POINT_ICONS[index] ?? ShieldCheck;
            return (
              <li key={point.title} className="flex gap-3">
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-6 shrink-0 text-text"
                />
                <span className="grid gap-1">
                  <span className="text-body font-semibold text-text">
                    {point.title}
                  </span>
                  <span className="text-body-sm text-text-secondary">
                    {point.body}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <section
        aria-labelledby="legal-acceptance-documents"
        className="grid gap-2"
      >
        <h2
          id="legal-acceptance-documents"
          className="text-h4 text-text-heading"
        >
          {copy.screen.documentsLabel}
        </h2>
        <ul
          data-legal-acceptance-documents
          className="flex list-none flex-wrap gap-x-4 gap-y-2 text-body-sm"
        >
          {DOCUMENTS.map((key) => (
            <li key={key}>
              <Link
                href={localizedPath(locale, LEGAL_DOCUMENT_PATHS[key])}
                target="_blank"
                // A prefixed address from an unprefixed page: the proxy
                // cannot see a prefetch (ADR-0029 D10).
                prefetch={false}
              >
                {getLegalDocument(locale, key).title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <LegalAcceptanceForms
        copy={copy.screen}
        next={next}
        declineDeletesAccount={declineDeletesAccount}
        accept={acceptLegalDocumentsAction}
        decline={declineLegalDocumentsAction}
      />
    </AuthFrame>
  );
}
