import type { Metadata } from "next";

import { AuthFrame } from "@/app/(default)/auth/auth-frame";
import { DocumentLink } from "@/components/ui/link";
import {
  parseReportAddress,
  reportAddressPath,
} from "@/lib/moderation/report-contract";
import { getReportCopy } from "@/lib/moderation/report-copy";
import { getRequestInterfaceLocale } from "@/server/interface-localization";
import { resolveReportTarget } from "@/server/moderation/content-reports";

import { submitReportAction } from "./actions";
import { ReportForm } from "./report-form";

export async function generateMetadata(): Promise<Metadata> {
  const copy = getReportCopy(await getRequestInterfaceLocale());
  return {
    title: copy.form.metadataTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * The report form (ADR-0038 D5, `OVE-526`; DSA Art. 16): anyone, signed in or
 * not, reports the public page they came from. The address arrives from the
 * page's «Поскаржитися» link; what it names is looked up here and again when
 * the form is sent, so a page that went meanwhile is said to be gone.
 */
export default async function ReportRoute({
  searchParams,
}: {
  searchParams?: Promise<{ address?: string | string[] }>;
}) {
  const [params, locale] = await Promise.all([
    searchParams ?? Promise.resolve<{ address?: string | string[] }>({}),
    getRequestInterfaceLocale(),
  ]);
  const copy = getReportCopy(locale).form;
  const raw = Array.isArray(params.address)
    ? params.address[0]
    : params.address;
  const address = parseReportAddress(raw);
  const target = address
    ? await resolveReportTarget(address).catch(() => null)
    : null;

  if (!address || !target) {
    return (
      <AuthFrame locale={locale} screen="report" title={copy.title}>
        <p
          data-report-unavailable="true"
          className="text-body text-text-secondary"
        >
          {address ? copy.notFound : copy.errors.address}
        </p>
      </AuthFrame>
    );
  }

  const path = reportAddressPath(address);
  return (
    <AuthFrame
      locale={locale}
      screen="report"
      title={copy.title}
      description={copy.note}
    >
      <section aria-labelledby="report-question" className="grid gap-3">
        <h2 id="report-question" className="text-h3 text-text-heading">
          {copy.question[target.kind]}
        </h2>
        <p className="grid gap-0.5 rounded-lg border border-border px-4 py-3 text-body-sm">
          <span className="text-caption text-text-muted">{copy.target}</span>
          <span className="font-medium break-words text-text">
            {target.label}
          </span>
          <DocumentLink href={path} className="text-caption break-all">
            {path}
          </DocumentLink>
        </p>
      </section>
      <ReportForm
        copy={copy}
        address={path}
        backHref={path}
        submit={submitReportAction}
      />
    </AuthFrame>
  );
}
