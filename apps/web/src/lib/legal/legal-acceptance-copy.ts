import type { PublicLocale } from "@/lib/public-localization";

/**
 * The words of the one acceptance (ADR-0038 D2, `OVE-526`): the sign-up
 * checkbox and the screen a Google sign-in or an older account meets before
 * the workspace. The documents themselves are `legal-documents.ts`.
 */
export interface LegalAcceptanceCopy {
  /** «Я приймаю умови використання, політику приватності та правила cookies.» */
  consent: {
    before: string;
    terms: string;
    between: string;
    privacy: string;
    and: string;
    cookies: string;
    after: string;
  };
  /** The sign-up refusal when the box is not ticked. */
  signUpRequired: string;
  screen: {
    metadataTitle: string;
    title: string;
    /** For an account that accepted an earlier version. */
    updatedTitle: string;
    lead: string;
    updatedLead: string;
    pointsLabel: string;
    /** Three points in Threads' «How Threads works» shape: what, then why. */
    points: readonly { title: string; body: string }[];
    documentsLabel: string;
    cookiesTitle: string;
    cookiesLead: string;
    analyticsLabel: string;
    analyticsDescription: string;
    marketingLabel: string;
    marketingDescription: string;
    accept: string;
    accepting: string;
    decline: string;
    declineNote: string;
    /** A just-created account that never accepted is deleted on decline. */
    declineNewAccountNote: string;
    failed: string;
  };
}

const COPY: Record<PublicLocale, LegalAcceptanceCopy> = {
  uk: {
    consent: {
      before: "Я приймаю ",
      terms: "умови використання",
      between: ", ",
      privacy: "політику приватності",
      and: " та ",
      cookies: "правила cookies",
      after: ".",
    },
    signUpRequired:
      "Щоб створити акаунт, прийміть умови використання, політику приватності та правила cookies.",
    screen: {
      metadataTitle: "Умови використання — прийняття",
      title: "Умови використання Overgarden",
      updatedTitle: "Ми оновили умови",
      lead: "Щоб користуватися Overgarden, прийміть умови використання, політику приватності та правила cookies. Це потрібно один раз: далі Overgarden нічого не питатиме, доки документи не зміняться.",
      updatedLead:
        "Умови використання, політика приватності або правила cookies змінилися. Прийміть нову версію, щоб і далі вести свій сад.",
      pointsLabel: "Головне",
      points: [
        {
          title: "Записи публічні",
          body: "Опубліковані записи, паспорти рослин і тварин та сторінки просторів може прочитати будь-хто.",
        },
        {
          title: "Фото ілюструють види",
          body: "Фото з ваших записів можуть з'являтися на сторінках видів з підписом «@ваш нікнейм».",
        },
        {
          title: "Ваші дані — ваші",
          body: "Видалити свої дані можна за запитом: ми виконуємо його протягом місяця.",
        },
      ],
      documentsLabel: "Документи",
      cookiesTitle: "Cookies",
      cookiesLead:
        "Необхідні cookies працюють завжди. Аналітику й маркетинг вмикайте, лише якщо хочете: це два окремі вибори, і їх можна змінити будь-коли.",
      analyticsLabel: "Аналітика",
      analyticsDescription:
        "Google Analytics і Microsoft Clarity: як читають сторінки.",
      marketingLabel: "Маркетинг",
      marketingDescription: "Meta Pixel: як працює реклама Overgarden.",
      accept: "Прийняти",
      accepting: "Зберігаємо…",
      decline: "Не приймаю",
      declineNote:
        "Без прийняття ви вийдете з акаунта. Читати публічні сторінки можна й без нього.",
      declineNewAccountNote:
        "Без прийняття акаунт, щойно створений через Google, буде видалено. Читати публічні сторінки можна й без нього.",
      failed: "Не вдалося зберегти. Спробуйте ще раз.",
    },
  },
  bg: {
    consent: {
      before: "Приемам ",
      terms: "условията за ползване",
      between: ", ",
      privacy: "политиката за поверителност",
      and: " и ",
      cookies: "правилата за бисквитките",
      after: ".",
    },
    signUpRequired:
      "За да създадете профил, приемете условията за ползване, политиката за поверителност и правилата за бисквитките.",
    screen: {
      metadataTitle: "Условия за ползване — приемане",
      title: "Условия за ползване на Overgarden",
      updatedTitle: "Обновихме условията",
      lead: "За да ползвате Overgarden, приемете условията за ползване, политиката за поверителност и правилата за бисквитките. Нужно е веднъж: после Overgarden няма да пита нищо, докато документите не се променят.",
      updatedLead:
        "Условията за ползване, политиката за поверителност или правилата за бисквитките се промениха. Приемете новата версия, за да продължите да водите градината си.",
      pointsLabel: "Най-важното",
      points: [
        {
          title: "Записите са публични",
          body: "Публикуваните записи, паспортите на растенията и животните и страниците на пространствата може да прочете всеки.",
        },
        {
          title: "Снимките илюстрират видовете",
          body: "Снимки от вашите записи може да се появяват на страниците на видовете с подпис «@вашият псевдоним».",
        },
        {
          title: "Данните ви са ваши",
          body: "Можете да поискате изтриване на данните си: изпълняваме искането в рамките на един месец.",
        },
      ],
      documentsLabel: "Документи",
      cookiesTitle: "Бисквитки",
      cookiesLead:
        "Необходимите бисквитки работят винаги. Включете анализите и маркетинга само ако искате: това са два отделни избора и можете да ги промените по всяко време.",
      analyticsLabel: "Анализи",
      analyticsDescription:
        "Google Analytics и Microsoft Clarity: как се четат страниците.",
      marketingLabel: "Маркетинг",
      marketingDescription: "Meta Pixel: как работи рекламата на Overgarden.",
      accept: "Приемам",
      accepting: "Запазваме…",
      decline: "Не приемам",
      declineNote:
        "Без приемане ще излезете от профила. Публичните страници може да се четат и без него.",
      declineNewAccountNote:
        "Без приемане профилът, току-що създаден чрез Google, ще бъде изтрит. Публичните страници може да се четат и без него.",
      failed: "Не успяхме да запазим. Опитайте отново.",
    },
  },
  ru: {
    consent: {
      before: "Я принимаю ",
      terms: "условия использования",
      between: ", ",
      privacy: "политику конфиденциальности",
      and: " и ",
      cookies: "правила cookies",
      after: ".",
    },
    signUpRequired:
      "Чтобы создать аккаунт, примите условия использования, политику конфиденциальности и правила cookies.",
    screen: {
      metadataTitle: "Условия использования — принятие",
      title: "Условия использования Overgarden",
      updatedTitle: "Мы обновили условия",
      lead: "Чтобы пользоваться Overgarden, примите условия использования, политику конфиденциальности и правила cookies. Это нужно один раз: дальше Overgarden ничего не будет спрашивать, пока документы не изменятся.",
      updatedLead:
        "Условия использования, политика конфиденциальности или правила cookies изменились. Примите новую версию, чтобы и дальше вести свой сад.",
      pointsLabel: "Главное",
      points: [
        {
          title: "Записи публичны",
          body: "Опубликованные записи, паспорта растений и животных и страницы пространств может прочитать кто угодно.",
        },
        {
          title: "Фото иллюстрируют виды",
          body: "Фото из ваших записей могут появляться на страницах видов с подписью «@ваш никнейм».",
        },
        {
          title: "Ваши данные — ваши",
          body: "Удалить свои данные можно по запросу: мы выполняем его в течение месяца.",
        },
      ],
      documentsLabel: "Документы",
      cookiesTitle: "Cookies",
      cookiesLead:
        "Необходимые cookies работают всегда. Аналитику и маркетинг включайте, только если хотите: это два отдельных выбора, и их можно изменить в любой момент.",
      analyticsLabel: "Аналитика",
      analyticsDescription:
        "Google Analytics и Microsoft Clarity: как читают страницы.",
      marketingLabel: "Маркетинг",
      marketingDescription: "Meta Pixel: как работает реклама Overgarden.",
      accept: "Принять",
      accepting: "Сохраняем…",
      decline: "Не принимаю",
      declineNote:
        "Без принятия вы выйдете из аккаунта. Читать публичные страницы можно и без него.",
      declineNewAccountNote:
        "Без принятия аккаунт, только что созданный через Google, будет удалён. Читать публичные страницы можно и без него.",
      failed: "Не удалось сохранить. Попробуйте ещё раз.",
    },
  },
};

export function getLegalAcceptanceCopy(
  locale: PublicLocale,
): LegalAcceptanceCopy {
  return COPY[locale];
}
