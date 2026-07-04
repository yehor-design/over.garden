import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicLocalizedHeader } from "@/components/public/localized-public-pages";
import {
  buildLanguageAlternates,
  isPublicLocale,
  localizedPath,
  PUBLIC_LOCALES,
  type PublicLocale,
} from "@/lib/public-localization";
import {
  ERASURE_REQUEST_INTAKE_VERSION,
  FIRST_PUBLICATION_DISCLOSURE_VERSION,
  MVP_LEGAL_COPY_STATUS,
  SUPPORT_EMAIL,
} from "@/lib/privacy/disclosures";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface LocalizedPrivacyRouteProps {
  params: Promise<{ locale: string }>;
}

const PRIVACY_COPY: Record<
  PublicLocale,
  {
    metadataTitle: string;
    metadataDescription: string;
    title: string;
    intro: string;
    statusLabel: string;
    controlsTitle: string;
    controls: string[];
    retentionTitle: string;
    retention: string[];
    boundariesTitle: string;
    boundaries: string[];
    contactTitle: string;
    contactBody: string;
    relatedTitle: string;
    erasureLink: string;
    supportLink: string;
    firstPublicationLink: string;
  }
> = {
  uk: {
    metadataTitle: "MVP повідомлення про приватність | OverGarden",
    metadataDescription:
      "Founder-approved MVP повідомлення OverGarden про приватність, публікацію, підтримку й зберігання даних.",
    title: "MVP повідомлення про приватність",
    intro:
      "Це повідомлення описує поточну MVP-поведінку OverGarden для публічних сторінок, підтримки, запитів на видалення й строків зберігання. Текст написаний/згенерований внутрішньо й approved by founder для MVP; lawyer review deferred.",
    statusLabel:
      "Founder-approved MVP copy; lawyer review deferred",
    controlsTitle: "Поточні MVP controls",
    controls: [
      "Точне місце не збирається і не показується; можуть з'являтися лише підтримані грубі регіони, якщо gardener обирає region visibility.",
      "Публічні фото використовують server-cleaned копії; оригінальні завантаження не є assets публічних сторінок.",
      "Корисні first-party editorial, guide, answer і landing pages можуть індексуватися для MVP. Thin, unsafe або UGC surfaces лишаються поза sitemap без explicit promotion rules.",
      "Архівовані публічні записи перестають показувати journal text на попередній публічній URL-адресі, виходять із public discovery surfaces і queued for public search removal. External crawler/search/AI copies are best-effort removal only.",
      `Запити на видалення використовують operator-reviewed intake version ${ERASURE_REQUEST_INTAKE_VERSION}; надсилання форми ніколи не видаляє дані автоматично.`,
    ],
    retentionTitle: "Data retention",
    retention: [
      "Private quarantine originals delete after successful processing or after 7 failed-processing days.",
      "Public derivatives stay while active and are removed from public surfaces after archive or erasure.",
      "Operator audit logs and erasure handling evidence are retained for 1 year.",
      "First-party product analytics events are retained for up to 13 months; consented Google Tag Manager / Google Analytics page measurement can run on authored public, legal, and support pages.",
      "Operator evidence must not include private journal text, precise location, private emails, IP/user-agent, media keys, or raw tokens.",
    ],
    boundariesTitle: "Review boundaries",
    boundaries: [
      "Lawyer review is deferred until after MVP learning.",
      "This policy does not add monetization terms.",
      "Legal, support, erasure, and diagnostic pages remain unlisted for search engines unless a later SEO policy deliberately promotes them.",
    ],
    contactTitle: "Support and privacy contact",
    contactBody: `For privacy, erasure, or account support, email ${SUPPORT_EMAIL}.`,
    relatedTitle: "Пов'язані controls",
    erasureLink: "Запит на видалення даних",
    supportLink: "Support and privacy contact",
    firstPublicationLink: "Disclosure першої публікації",
  },
  bg: {
    metadataTitle: "MVP уведомление за поверителност | OverGarden",
    metadataDescription:
      "Founder-approved MVP уведомление на OverGarden за поверителност, публикуване, поддръжка и съхранение на данни.",
    title: "MVP уведомление за поверителност",
    intro:
      "Това уведомление описва текущото MVP поведение на OverGarden за публични страници, поддръжка, заявки за изтриване и срокове за съхранение. Текстът е written/generated internally и approved by founder за MVP; lawyer review deferred.",
    statusLabel:
      "Founder-approved MVP copy; lawyer review deferred",
    controlsTitle: "Текущи MVP controls",
    controls: [
      "Точно местоположение не се събира и не се показва; могат да се показват само поддържани груби региони, когато gardener избере region visibility.",
      "Публичните снимки използват server-cleaned копия; оригиналните качвания не са assets на публичните страници.",
      "Полезни first-party editorial, guide, answer и landing pages могат да се индексират за MVP. Thin, unsafe или UGC surfaces остават извън sitemap без explicit promotion rules.",
      "Архивираните публични записи спират да показват journal text на предишния публичен URL, напускат public discovery surfaces и се queued for public search removal. External crawler/search/AI copies are best-effort removal only.",
      `Заявките за изтриване използват operator-reviewed intake version ${ERASURE_REQUEST_INTAKE_VERSION}; изпращането на формата никога не изтрива данни автоматично.`,
    ],
    retentionTitle: "Data retention",
    retention: [
      "Private quarantine originals delete after successful processing or after 7 failed-processing days.",
      "Public derivatives stay while active and are removed from public surfaces after archive or erasure.",
      "Operator audit logs and erasure handling evidence are retained for 1 year.",
      "First-party product analytics events are retained for up to 13 months; consented Google Tag Manager / Google Analytics page measurement can run on authored public, legal, and support pages.",
      "Operator evidence must not include private journal text, precise location, private emails, IP/user-agent, media keys, or raw tokens.",
    ],
    boundariesTitle: "Review boundaries",
    boundaries: [
      "Lawyer review is deferred until after MVP learning.",
      "This policy does not add monetization terms.",
      "Legal, support, erasure, and diagnostic pages remain unlisted for search engines unless a later SEO policy deliberately promotes them.",
    ],
    contactTitle: "Support and privacy contact",
    contactBody: `For privacy, erasure, or account support, email ${SUPPORT_EMAIL}.`,
    relatedTitle: "Свързани controls",
    erasureLink: "Заявка за изтриване на данни",
    supportLink: "Support and privacy contact",
    firstPublicationLink: "Disclosure за първо публикуване",
  },
  ru: {
    metadataTitle: "MVP уведомление о приватности | OverGarden",
    metadataDescription:
      "Founder-approved MVP уведомление OverGarden о приватности, публикации, поддержке и хранении данных.",
    title: "MVP уведомление о приватности",
    intro:
      "Это уведомление описывает текущую MVP-поведение OverGarden для публичных страниц, поддержки, запросов на удаление и сроков хранения. Текст written/generated internally и approved by founder для MVP; lawyer review deferred.",
    statusLabel:
      "Founder-approved MVP copy; lawyer review deferred",
    controlsTitle: "Текущие MVP controls",
    controls: [
      "Точное местоположение не собирается и не показывается; могут появляться только поддержанные грубые регионы, когда gardener выбирает region visibility.",
      "Публичные фотографии используют server-cleaned копии; оригинальные загрузки не являются assets публичных страниц.",
      "Полезные first-party editorial, guide, answer и landing pages могут индексироваться для MVP. Thin, unsafe или UGC surfaces остаются вне sitemap без explicit promotion rules.",
      "Архивированные публичные записи перестают показывать journal text на прежнем публичном URL, выходят из public discovery surfaces и queued for public search removal. External crawler/search/AI copies are best-effort removal only.",
      `Запросы на удаление используют operator-reviewed intake version ${ERASURE_REQUEST_INTAKE_VERSION}; отправка формы никогда не удаляет данные автоматически.`,
    ],
    retentionTitle: "Data retention",
    retention: [
      "Private quarantine originals delete after successful processing or after 7 failed-processing days.",
      "Public derivatives stay while active and are removed from public surfaces after archive or erasure.",
      "Operator audit logs and erasure handling evidence are retained for 1 year.",
      "First-party product analytics events are retained for up to 13 months; consented Google Tag Manager / Google Analytics page measurement can run on authored public, legal, and support pages.",
      "Operator evidence must not include private journal text, precise location, private emails, IP/user-agent, media keys, or raw tokens.",
    ],
    boundariesTitle: "Review boundaries",
    boundaries: [
      "Lawyer review is deferred until after MVP learning.",
      "This policy does not add monetization terms.",
      "Legal, support, erasure, and diagnostic pages remain unlisted for search engines unless a later SEO policy deliberately promotes them.",
    ],
    contactTitle: "Support and privacy contact",
    contactBody: `For privacy, erasure, or account support, email ${SUPPORT_EMAIL}.`,
    relatedTitle: "Связанные controls",
    erasureLink: "Запрос на удаление данных",
    supportLink: "Support and privacy contact",
    firstPublicationLink: "Disclosure первой публикации",
  },
};

export function generateStaticParams() {
  return PUBLIC_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LocalizedPrivacyRouteProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const noindexState = evaluatePublicSurfaceIndexability({
    kind: isPublicLocale(localeParam) ? "profile" : "missing",
  });
  const copy = isPublicLocale(localeParam)
    ? PRIVACY_COPY[localeParam]
    : PRIVACY_COPY.uk;

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: isPublicLocale(localeParam)
      ? {
          canonical: localizedPath(localeParam, "/privacy"),
          languages: buildLanguageAlternates("/privacy"),
        }
      : undefined,
    robots: noindexState.robots,
  };
}

export default async function LocalizedPrivacyNoticePage({
  params,
}: LocalizedPrivacyRouteProps) {
  const { locale: localeParam } = await params;

  if (!isPublicLocale(localeParam)) notFound();
  const copy = PRIVACY_COPY[localeParam];

  return (
    <main
      lang={localeParam}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8"
    >
      <PublicLocalizedHeader
        locale={localeParam}
        basePath="/privacy"
        availableLocales={PUBLIC_LOCALES}
      />
      <header className="border-b border-border pb-5">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.intro}
        </p>
      </header>
      <div className="grid gap-4 text-sm leading-6 text-foreground">
        <p>
          Status: <strong>{copy.statusLabel}</strong> ({MVP_LEGAL_COPY_STATUS}
          ).
        </p>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.controlsTitle}
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {copy.controls.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.retentionTitle}
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {copy.retention.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.boundariesTitle}
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {copy.boundaries.map((boundary) => (
              <li key={boundary}>{boundary}</li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.contactTitle}
          </h2>
          <p className="text-muted-foreground">
            {copy.contactBody.split(SUPPORT_EMAIL)[0]}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            {copy.contactBody.split(SUPPORT_EMAIL)[1]}
          </p>
        </section>
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {copy.relatedTitle}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/erasure"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.erasureLink}
            </Link>
            <Link
              href="/support"
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.supportLink}
            </Link>
            <Link
              href={localizedPath(localeParam, "/first-publication-disclosure")}
              className="text-primary underline-offset-4 hover:underline"
            >
              {copy.firstPublicationLink} {FIRST_PUBLICATION_DISCLOSURE_VERSION}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
