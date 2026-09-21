import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import { FileTextIcon as FileText } from "@/components/icons/FileText";

import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PublicCatalogRegisterCopy } from "@/lib/public-catalog-register-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type { CatalogRegisterHub } from "@/server/public-catalog-register-repository";

/**
 * A register hub (ADR-0029 D13 item 4, OVE-433).
 *
 * ADR-0026 D9 keeps a bare source-built card `noindex`, and it should: a
 * hundred thousand pages reading "*Bactrocera dorsalis* — вид" is thin
 * content. The aggregation over those cards is not thin — "621 сортів томата у
 * реєстрах", with each cultivar's registration number — and it is the thing
 * nobody else publishes, because nobody else holds both registers in one
 * catalog.
 *
 * Every row links to the cultivar's own page, so this is also a crawl path
 * into the part of the catalog that is worth reaching.
 */
export function PublicCatalogRegisterHub({
  locale,
  copy,
  hub,
  jsonLd,
}: {
  locale: PublicLocale;
  copy: PublicCatalogRegisterCopy;
  hub: CatalogRegisterHub;
  jsonLd?: Record<string, unknown> | null;
}) {
  const serializedJsonLd = serializePublicSurfaceJsonLd(jsonLd ?? null);

  return (
    <main
      lang={locale}
      data-public-catalog-register="true"
      data-register-species={hub.speciesSlug}
      data-register-total={hub.total}
      className="flex w-full min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 md:py-12"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}

      <PageHeader
        breadcrumb={
          <Link
            href={localizedPath(locale, hub.speciesPath)}
            variant="muted"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-body-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.backToSpecies}
          </Link>
        }
        title={copy.heading(hub.speciesName, hub.total)}
        description={copy.sourceNote}
      />

      <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 text-body-sm text-text-muted">
        {hub.registeredUa > 0 ? (
          <li>{copy.registeredUa(hub.registeredUa)}</li>
        ) : null}
        {hub.registeredEu > 0 ? (
          <li>{copy.registeredEu(hub.registeredEu)}</li>
        ) : null}
      </ul>

      {/* A register is data with two axes — a cultivar and where it is
          registered — so it is a real table, with a caption and a `scope` on
          every header (DESIGN.md §8). The caption is what a screen reader
          reads before the cells, so it names the species rather than the
          column count. */}
      <Table caption={copy.heading(hub.speciesName, hub.total)} captionHidden>
        <TableHead>
          <TableRow>
            <TableHeader scope="col">{copy.columnName}</TableHeader>
            <TableHeader scope="col">{copy.columnRegister}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {hub.forms.map((form) => (
            <TableRow key={form.id}>
              <TableHeader scope="row" className="font-normal">
                <Link href={localizedPath(locale, form.path)} variant="quiet">
                  {form.name}
                </Link>
              </TableHeader>
              <TableCell className="text-text-muted">
                <RegisterCell copy={copy} form={form} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}

function RegisterCell({
  copy,
  form,
}: {
  copy: PublicCatalogRegisterCopy;
  form: CatalogRegisterHub["forms"][number];
}) {
  const entries: string[] = [];
  if (form.registeredUa) {
    entries.push(
      `${copy.uaRegisterLabel}: ${
        registerNumber(form.uaRegisterNumber) ?? copy.noRegisterNumber
      }`,
    );
  }
  if (form.registeredEu) {
    entries.push(
      `${copy.euCatalogueLabel}: ${
        registerNumber(form.euCatalogueReference) ?? copy.noRegisterNumber
      }`,
    );
  }
  if (entries.length === 0) return <>{copy.noRegisterNumber}</>;

  return (
    <span className="flex flex-col gap-0.5">
      {entries.map((entry) => (
        <span key={entry} className="flex items-center gap-1.5">
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          {entry}
        </span>
      ))}
    </span>
  );
}

/**
 * The number a reader would quote, out of the identifier the ingest stored.
 *
 * `RegisterVarietis:09040016` is a scheme and a number, and only the number is
 * on the paper; the EU reference is an ELI with a row digest, whose last
 * segment says nothing to anybody, so that one keeps its document reference.
 */
export function registerNumber(value: string | null): string | null {
  if (!value) return null;
  const ua = /^RegisterVarietis:(\d+)$/u.exec(value);
  if (ua) return ua[1]!;
  const eli = /^EUR-Lex:(ELI:[^:]+):row:[0-9a-f]+$/u.exec(value);
  if (eli) return eli[1]!;
  return value;
}
