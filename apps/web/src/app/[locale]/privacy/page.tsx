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
  PILOT_LEGAL_COPY_STATUS,
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
    blockersTitle: string;
    blockers: string[];
    relatedTitle: string;
    erasureLink: string;
    firstPublicationLink: string;
  }
> = {
  uk: {
    metadataTitle: "Пілотне повідомлення про приватність | OverGarden",
    metadataDescription:
      "Пілотне повідомлення OverGarden про приватність, публікацію й запити на видалення даних.",
    title: "Пілотне повідомлення про приватність",
    intro:
      "Це повідомлення описує поведінку продукту, активну в закритому пілоті сьогодні. Воно перевірене для контрольованого пілотного використання, а публічний запуск лишається заблокованим до фінального юридичного й процесного перегляду.",
    statusLabel:
      "Перевірено для закритого пілоту; публічний запуск лишається заблокованим",
    controlsTitle: "Поточні пілотні controls",
    controls: [
      "Точне місце не збирається і не показується у v0.",
      "Публічні фото використовують server-cleaned копії; оригінальні завантаження не є assets публічних сторінок.",
      "Публічні сторінки не додаються до індексації, якщо явні правила promotion не дозволяють індексацію.",
      "Архівовані публічні записи перестають показувати journal text на попередній публічній URL-адресі й виходять із public discovery surfaces.",
      `Запити на видалення використовують operator-reviewed intake version ${ERASURE_REQUEST_INTAKE_VERSION}; надсилання форми ніколи не видаляє дані автоматично.`,
    ],
    blockersTitle: "Блокери публічного запуску",
    blockers: [
      "Фінально перевірений юридичний текст політики.",
      "Перевірений операторський контакт і процес відповіді.",
      "Формулювання про процесорів, retention і legal basis.",
      "Production proof maintainer-approved erasure workflow перед public self-serve traffic.",
    ],
    relatedTitle: "Пов'язані controls",
    erasureLink: "Запит на видалення даних",
    firstPublicationLink: "Disclosure першої публікації",
  },
  bg: {
    metadataTitle: "Пилотно уведомление за поверителност | OverGarden",
    metadataDescription:
      "Пилотно уведомление на OverGarden за поверителност, публикуване и заявки за изтриване на данни.",
    title: "Пилотно уведомление за поверителност",
    intro:
      "Това уведомление описва поведението на продукта, което е активно в закрития пилот днес. То е прегледано за контролирана пилотна употреба, а публичното пускане остава блокирано до финален правен и процесен преглед.",
    statusLabel:
      "Прегледано за закрития пилот; публичното пускане остава блокирано",
    controlsTitle: "Текущи пилотни controls",
    controls: [
      "Точно местоположение не се събира и не се показва във v0.",
      "Публичните снимки използват server-cleaned копия; оригиналните качвания не са assets на публичните страници.",
      "Публичните страници не се добавят за индексиране, освен ако изрични promotion правила не го позволяват.",
      "Архивираните публични записи спират да показват journal text на предишния публичен URL и напускат public discovery surfaces.",
      `Заявките за изтриване използват operator-reviewed intake version ${ERASURE_REQUEST_INTAKE_VERSION}; изпращането на формата никога не изтрива данни автоматично.`,
    ],
    blockersTitle: "Блокери за публично пускане",
    blockers: [
      "Финално прегледан правен текст на политиката.",
      "Проверен операторски контакт и процес за отговор.",
      "Формулировки за processors, retention и legal basis.",
      "Production proof на maintainer-approved erasure workflow преди public self-serve traffic.",
    ],
    relatedTitle: "Свързани controls",
    erasureLink: "Заявка за изтриване на данни",
    firstPublicationLink: "Disclosure за първо публикуване",
  },
  ru: {
    metadataTitle: "Пилотное уведомление о приватности | OverGarden",
    metadataDescription:
      "Пилотное уведомление OverGarden о приватности, публикации и запросах на удаление данных.",
    title: "Пилотное уведомление о приватности",
    intro:
      "Это уведомление описывает поведение продукта, активное в закрытом пилоте сегодня. Оно проверено для контролируемого пилотного использования, а публичный запуск остается заблокированным до финальной юридической и процессной проверки.",
    statusLabel:
      "Проверено для закрытого пилота; публичный запуск остается заблокированным",
    controlsTitle: "Текущие пилотные controls",
    controls: [
      "Точное местоположение не собирается и не показывается в v0.",
      "Публичные фотографии используют server-cleaned копии; оригинальные загрузки не являются assets публичных страниц.",
      "Публичные страницы не добавляются в индексацию, если явные promotion правила не разрешают индексацию.",
      "Архивированные публичные записи перестают показывать journal text на прежнем публичном URL и выходят из public discovery surfaces.",
      `Запросы на удаление используют operator-reviewed intake version ${ERASURE_REQUEST_INTAKE_VERSION}; отправка формы никогда не удаляет данные автоматически.`,
    ],
    blockersTitle: "Блокеры публичного запуска",
    blockers: [
      "Финально проверенный юридический текст политики.",
      "Проверенный операторский контакт и процесс ответа.",
      "Формулировки о processors, retention и legal basis.",
      "Production proof maintainer-approved erasure workflow перед public self-serve traffic.",
    ],
    relatedTitle: "Связанные controls",
    erasureLink: "Запрос на удаление данных",
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
          Status: <strong>{copy.statusLabel}</strong> ({PILOT_LEGAL_COPY_STATUS}
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
            {copy.blockersTitle}
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {copy.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
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
