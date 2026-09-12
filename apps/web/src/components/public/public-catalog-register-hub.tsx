import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

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
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-5"
    >
      {serializedJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
        />
      ) : null}

      <header className="flex flex-col gap-3 border-b border-border pb-5">
        <Link
          href={localizedPath(locale, hub.speciesPath)}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" />
          {copy.backToSpecies}
        </Link>
        <h1 className="text-3xl leading-tight font-semibold text-foreground sm:text-4xl">
          {copy.heading(hub.speciesName, hub.total)}
        </h1>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {hub.registeredUa > 0 ? (
            <li>{copy.registeredUa(hub.registeredUa)}</li>
          ) : null}
          {hub.registeredEu > 0 ? (
            <li>{copy.registeredEu(hub.registeredEu)}</li>
          ) : null}
        </ul>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {copy.sourceNote}
        </p>
      </header>

      <section className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <th scope="col" className="py-2 pr-4 font-medium">
                {copy.columnName}
              </th>
              <th scope="col" className="py-2 font-medium">
                {copy.columnRegister}
              </th>
            </tr>
          </thead>
          <tbody>
            {hub.forms.map((form) => (
              <tr key={form.id} className="border-b border-border/60">
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  <Link
                    href={localizedPath(locale, form.path)}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {form.name}
                  </Link>
                </th>
                <td className="py-2 text-muted-foreground">
                  <RegisterCell copy={copy} form={form} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
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
