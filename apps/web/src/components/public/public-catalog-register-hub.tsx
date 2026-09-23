import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";
import { FileTextIcon as FileText } from "@/components/icons/FileText";
import { MagnifyingGlassIcon as Search } from "@/components/icons/MagnifyingGlass";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Link } from "@/components/ui/link";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { publicCatalogRegisterHubPath } from "@/lib/catalog/addresses";
import { registerNumber } from "@/lib/catalog/source-names";
import {
  registerFormsKind,
  type PublicCatalogRegisterCopy,
} from "@/lib/public-catalog-register-copy";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";
import { serializePublicSurfaceJsonLd } from "@/lib/public-surface-json-ld";
import type { CatalogRegisterHub } from "@/server/public-catalog-register-repository";

/**
 * A species' forms, one link from its card (ADR-0029 D13 item 4, OVE-433).
 *
 * ADR-0026 D9 keeps a bare source-built card `noindex`, and it should: a
 * hundred thousand pages reading "*Bactrocera dorsalis* — вид" is thin
 * content. The aggregation over those cards is not thin — every cultivar of a
 * species with the registration number a seed packet quotes — and it is the
 * thing nobody else publishes, because nobody else holds both registers in
 * one catalog.
 *
 * Since `OVE-497` it is also where a species' forms live at all: the card
 * names a dozen and links here, because the tomato has 621 and the largest
 * species over four thousand. So it searches — a word anywhere in a name —
 * and it pages, a hundred at a time. Both are in the address (`?q=`,
 * `?page=`), so the way back from a cultivar is the browser's own Back, to
 * the same search and the same page. Every row links to the form's own page,
 * which keeps this the crawl path into the part of the catalog worth reaching.
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
  const kind = registerFormsKind(hub.speciesKingdom);
  const hubPath = localizedPath(
    locale,
    publicCatalogRegisterHubPath(hub.speciesSlug),
  );
  const viewHref = (page: number) => {
    const params = new URLSearchParams();
    if (hub.query) params.set("q", hub.query);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `${hubPath}?${query}` : hubPath;
  };
  const searchId = "register-search";

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
            data-register-back="true"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 text-body-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.backToSpecies}
          </Link>
        }
        title={copy.heading(hub.speciesDisplayName, kind)}
        description={copy.sourceNote}
      />

      <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 text-body-sm text-text-muted">
        <li data-register-count="true">{copy.total(hub.total)}</li>
        {hub.registeredUa > 0 ? (
          <li>{copy.registeredUa(hub.registeredUa)}</li>
        ) : null}
        {hub.registeredEu > 0 ? (
          <li>{copy.registeredEu(hub.registeredEu)}</li>
        ) : null}
      </ul>

      {/* A real GET form to this page: it works before the bundle, and the
          search is in the address, so Back returns to it. */}
      <form
        method="get"
        action={hubPath}
        role="search"
        aria-label={copy.searchLabel}
        data-register-search="true"
        className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
      >
        <Field
          label={copy.searchLabel}
          id={searchId}
          className="min-w-0 flex-1 basis-full sm:basis-auto"
        >
          <SearchInput
            name="q"
            defaultValue={hub.query}
            maxLength={120}
            placeholder={copy.searchPlaceholder}
          />
        </Field>
        <Button type="submit" className="shrink-0">
          <Search aria-hidden="true" />
          {copy.searchSubmit}
        </Button>
      </form>

      {hub.query ? (
        <p
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body-sm text-text"
          data-register-result="true"
        >
          <span>
            {hub.matching > 0
              ? copy.searchResult(hub.matching, hub.query)
              : copy.noResults(hub.query)}
          </span>
          <Link href={hubPath} className="w-fit">
            {copy.showAll}
          </Link>
        </p>
      ) : null}

      {hub.forms.length > 0 ? (
        // A register is data with two axes — a form and where it is
        // registered — so it is a real table, with a caption and a `scope` on
        // every header (DESIGN.md §8). The caption names the species rather
        // than the column count, because it is what a screen reader reads
        // before the cells.
        <Table
          caption={copy.heading(hub.speciesDisplayName, kind)}
          captionHidden
        >
          <TableHead>
            <TableRow>
              <TableHeader scope="col">{copy.columnName}</TableHeader>
              <TableHeader scope="col">{copy.columnRegister}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {hub.forms.map((form) => (
              <TableRow key={form.id} data-register-form={form.id}>
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
      ) : null}

      {hub.pageCount > 1 ? (
        <Pagination
          label={copy.paginationLabel}
          previousHref={hub.page > 1 ? viewHref(hub.page - 1) : null}
          previousLabel={copy.previousPage}
          nextHref={hub.page < hub.pageCount ? viewHref(hub.page + 1) : null}
          nextLabel={copy.nextPage}
          status={copy.pageOf(hub.page, hub.pageCount)}
        />
      ) : null}
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
  if (entries.length === 0) return <>{copy.notRegistered}</>;

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
