import { PublicArticle, type PublicArticleSection } from "@/components/public/public-article";
import { Link } from "@/components/ui/link";
import {
  getLegalDocument,
  getLegalDocumentChrome,
  LEGAL_DOCUMENT_PATHS,
  LEGAL_EFFECTIVE_DATE,
  type LegalDocumentKey,
  type LegalSection,
} from "@/lib/legal/legal-documents";
import { localizedPath, type PublicLocale } from "@/lib/public-localization";

/**
 * One of Overgarden's three documents (`OVE-526`) — the terms, the privacy
 * policy or the cookie rules — as a reference article: its sections as real
 * headings with real ids (a link can name `#terms-photo-licence`), then any
 * interactive section the page adds (the cookie choices), then the version
 * with its date and the other two documents.
 */
export function LegalDocumentPage({
  locale,
  documentKey,
  extraSections = [],
}: {
  locale: PublicLocale;
  documentKey: LegalDocumentKey;
  /** Sections only the page itself can draw, after the text. */
  extraSections?: readonly PublicArticleSection[];
}) {
  const document = getLegalDocument(locale, documentKey);
  const chrome = getLegalDocumentChrome(locale);
  const others = (Object.keys(LEGAL_DOCUMENT_PATHS) as LegalDocumentKey[])
    .filter((key) => key !== documentKey)
    .map((key) => ({
      key,
      title: getLegalDocument(locale, key).title,
      href: localizedPath(locale, LEGAL_DOCUMENT_PATHS[key]),
    }));
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`));

  return (
    <PublicArticle
      locale={locale}
      dataset={{
        "data-legal-document": documentKey,
        "data-legal-version": document.version,
      }}
      title={document.title}
      description={document.intro}
      contentsLabel={document.title}
      sections={[
        ...document.sections.map((section) => ({
          id: section.id,
          heading: section.heading,
          body: <LegalSectionBody section={section} />,
        })),
        ...extraSections,
        {
          id: `${documentKey}-version`,
          heading: chrome.related,
          body: (
            <div className="grid gap-3 text-text-secondary">
              <ul className="flex list-none flex-wrap gap-4">
                {others.map((other) => (
                  <li key={other.key}>
                    <Link href={other.href}>{other.title}</Link>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-text-muted">
                {`${chrome.versionLine(date)} · ${document.version}. ${chrome.reviewNote}`}
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}

function LegalSectionBody({ section }: { section: LegalSection }) {
  return (
    <div className="grid gap-3 text-text-secondary">
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.items ? (
        <ul className="grid list-disc gap-2 pl-5">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
