import {
  DEFAULT_PUBLIC_LOCALE,
  isPublicLocale,
  type PublicLocale,
} from "./public-localization";
import {
  getDefaultInterfaceLocale,
  isInterfaceLocaleAllowed,
  normalizeInterfaceMarket,
  resolveInterfaceMarket,
  type InterfaceMarket,
  type InterfaceMarketResolutionSource,
} from "./interface-market";

export type InterfaceLocale = PublicLocale;

export const INTERFACE_LOCALE_COOKIE_NAME = "overgarden_interface_locale";
export const INTERFACE_LOCALE_REQUEST_HEADER = "x-overgarden-interface-locale";
export const INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
/**
 * Bounded, non-private document hint used only when the root React error
 * boundary cannot inherit layout props. Its value is always one closed market
 * and one locale allowed for that market; it never carries request or user data.
 */
export const INTERFACE_CONTEXT_META_NAME = "overgarden-interface-context";

type LocaleCandidate = string | null | undefined;

export interface InterfaceCopy {
  metadata: {
    siteTitle: string;
    siteDescription: string;
    workspaceTitle: string;
    workspaceDescription: string;
  };
  navigation: {
    feed: string;
    catalogue: string;
    /** The tab bar's fifth slot. Identity-neutral: signed out it means
     *  "sign in", signed in it means "your profile" (ADR-0031 D4). */
    you: string;
    livingObjects: string;
    journals: string;
    communities: string;
    knowledge: string;
    myGarden: string;
    addObject: string;
    addUpdate: string;
    drafts: string;
    garden: string;
    followedFeed: string;
    notifications: string;
    bookmarks: string;
    wishlist: string;
    lineageClaims: string;
    profile: string;
    publicProfile: string;
    signIn: string;
  };
  shell: {
    exploreSection: string;
    mySection: string;
    menuTitle: string;
    menuDescription: string;
    search: string;
    openMenu: string;
    closeMenu: string;
    skipToContent: string;
    siteNavigation: string;
    mobileNavigation: string;
    contextTitle: string;
    contextDescription: string;
    startJournal: string;
    privacy: string;
    account: string;
    loadingTitle: string;
    errorEyebrow: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
    languageControlLabel: string;
    languageControlTrigger: string;
    /** The one primary action of the shell, in the rail and on the tab bar. */
    primaryAction: string;
    /** Accessible names for the landmarks a screen reader would otherwise read
     *  as two identical "navigation" and two identical "complementary". */
    footerNavigation: string;
    contextRail: string;
    accountRegion: string;
    /** The footer, which the product had no `contentinfo` landmark for at all. */
    footerTagline: string;
    support: string;
    firstPublicationDisclosure: string;
    sourcesTitle: string;
    sourcesDescription: string;
    openAccount: string;
  };
  workspace: {
    title: string;
    returningDescription: string;
    emptyDescription: string;
  };
  object: {
    gardenJournal: string;
    livingObject: string;
    backToJournal: string;
  };
}

const INTERFACE_COPY = {
  uk: {
    metadata: {
      siteTitle: "OverGarden",
      siteDescription:
        "Журнал рослин, тварин і бджолосімей із каталогом, публічними історіями та спільнотами.",
      workspaceTitle: "Простір саду | OverGarden",
      workspaceDescription:
        "Приватний простір для живих об'єктів, датованих записів і наступних дій у саду.",
    },
    navigation: {
      feed: "Стрічка",
      catalogue: "Каталог",
      livingObjects: "Живі об'єкти",
      you: "Ви",
      journals: "Журнали",
      communities: "Спільноти",
      knowledge: "Знання",
      myGarden: "Мій сад",
      addObject: "Додати об'єкт",
      addUpdate: "Новий запис",
      drafts: "Чернетки",
      garden: "Сад",
      followedFeed: "Стрічка підписок",
      notifications: "Сповіщення",
      bookmarks: "Закладки",
      wishlist: "Список бажань",
      lineageClaims: "Запити щодо походження",
      profile: "Профіль",
      publicProfile: "Публічний профіль",
      signIn: "Увійти",
    },
    shell: {
      exploreSection: "Огляд",
      mySection: "Моє",
      menuTitle: "Навігація OverGarden",
      menuDescription: "Публічні розділи та ваш особистий сад.",
      search: "Пошук",
      openMenu: "Відкрити навігацію",
      closeMenu: "Закрити навігацію",
      skipToContent: "Перейти до основного вмісту",
      siteNavigation: "Основна навігація",
      mobileNavigation: "Основна мобільна навігація",
      contextTitle: "Далі",
      contextDescription:
        "Продовжуйте читати публічні історії або відкрийте власний журнал.",
      startJournal: "Почати журнал",
      privacy: "Приватність",
      account: "Обліковий запис",
      loadingTitle: "Завантаження OverGarden",
      errorEyebrow: "Не вдалося відкрити розділ",
      errorTitle: "Цю сторінку не вдалося завантажити",
      errorDescription:
        "Спробуйте ще раз. Ви можете продовжити навігацію в OverGarden, якщо помилка повториться.",
      retry: "Спробувати ще раз",
      languageControlLabel: "Вибір мови інтерфейсу",
      languageControlTrigger: "Змінити мову",
      primaryAction: "Новий запис",
      footerNavigation: "Навігація в підвалі",
      contextRail: "Додатковий контекст",
      accountRegion: "Обліковий запис",
      footerTagline:
        "Публічний журнал садівництва: кожен запис відкритий і його видно в пошуку.",
      support: "Підтримка",
      firstPublicationDisclosure: "Розкриття першої публікації",
      sourcesTitle: "Джерела даних",
      sourcesDescription:
        "Назви організмів — з Catalogue of Life; реєстрові дані — з EPPO Global Database. Світлини належать їхнім авторам.",
      openAccount: "Відкрити меню облікового запису",
    },
    workspace: {
      title: "Простір саду",
      returningDescription:
        "Ваші живі об'єкти, останні зміни й наступна дія в журналі в одному приватному місці.",
      emptyDescription:
        "Почніть з одного приватного живого об'єкта, а потім повертайтеся сюди щоразу, коли його історія змінюється.",
    },
    object: {
      gardenJournal: "Садовий журнал",
      livingObject: "Живий об'єкт",
      backToJournal: "Назад до журналу",
    },
  },
  bg: {
    metadata: {
      siteTitle: "OverGarden",
      siteDescription:
        "Дневник за растения, животни и пчелни семейства с каталог, публични истории и общности.",
      workspaceTitle: "Градинско пространство | OverGarden",
      workspaceDescription:
        "Лично пространство за живи обекти, датирани записи и следващи действия в градината.",
    },
    navigation: {
      feed: "Поток",
      catalogue: "Каталог",
      livingObjects: "Живи обекти",
      you: "Вие",
      journals: "Дневници",
      communities: "Общности",
      knowledge: "Знания",
      myGarden: "Моята градина",
      addObject: "Добавяне на обект",
      addUpdate: "Нов запис",
      drafts: "Чернови",
      garden: "Градина",
      followedFeed: "Следвани записи",
      notifications: "Известия",
      bookmarks: "Отметки",
      wishlist: "Желани",
      lineageClaims: "Заявки за произход",
      profile: "Профил",
      publicProfile: "Публичен профил",
      signIn: "Вход",
    },
    shell: {
      exploreSection: "Разглеждане",
      mySection: "Моето",
      menuTitle: "Навигация в OverGarden",
      menuDescription: "Публичните раздели и вашата лична градина.",
      search: "Търсене",
      openMenu: "Отваряне на навигацията",
      closeMenu: "Затваряне на навигацията",
      skipToContent: "Към основното съдържание",
      siteNavigation: "Основна навигация",
      mobileNavigation: "Основна мобилна навигация",
      contextTitle: "Следващо",
      contextDescription:
        "Продължете с публичните истории или отворете свой дневник.",
      startJournal: "Започване на дневник",
      privacy: "Поверителност",
      account: "Профил",
      loadingTitle: "Зареждане на OverGarden",
      errorEyebrow: "Разделът не може да се отвори",
      errorTitle: "Тази страница не може да се зареди",
      errorDescription:
        "Опитайте отново. Ако грешката се повтори, можете да продължите да разглеждате OverGarden.",
      retry: "Опитайте отново",
      languageControlLabel: "Избор на език на интерфейса",
      languageControlTrigger: "Смяна на езика",
      primaryAction: "Нов запис",
      footerNavigation: "Навигация в долния колонтитул",
      contextRail: "Допълнителен контекст",
      accountRegion: "Профил",
      footerTagline:
        "Публичен дневник за градинарство: всеки запис е отворен и се вижда в търсачките.",
      support: "Поддръжка",
      firstPublicationDisclosure: "Разкриване на първата публикация",
      sourcesTitle: "Източници на данни",
      sourcesDescription:
        "Имената на организмите са от Catalogue of Life; регистровите данни са от EPPO Global Database. Снимките принадлежат на авторите си.",
      openAccount: "Отваряне на менюто на профила",
    },
    workspace: {
      title: "Градинско пространство",
      returningDescription:
        "Вашите живи обекти, последните промени и следващото действие в дневника на едно лично място.",
      emptyDescription:
        "Започнете с един личен жив обект, след което се връщайте тук винаги когато историята му се променя.",
    },
    object: {
      gardenJournal: "Градински дневник",
      livingObject: "Жив обект",
      backToJournal: "Назад към дневника",
    },
  },
  ru: {
    metadata: {
      siteTitle: "OverGarden",
      siteDescription:
        "Журнал растений, животных и пчелиных семей с каталогом, публичными историями и сообществами.",
      workspaceTitle: "Пространство сада | OverGarden",
      workspaceDescription:
        "Личное пространство для живых объектов, датированных записей и следующих действий в саду.",
    },
    navigation: {
      feed: "Лента",
      catalogue: "Каталог",
      livingObjects: "Живые объекты",
      you: "Вы",
      journals: "Журналы",
      communities: "Сообщества",
      knowledge: "Знания",
      myGarden: "Мой сад",
      addObject: "Добавить объект",
      addUpdate: "Новая запись",
      drafts: "Черновики",
      garden: "Сад",
      followedFeed: "Лента подписок",
      notifications: "Уведомления",
      bookmarks: "Закладки",
      wishlist: "Список желаний",
      lineageClaims: "Заявки о происхождении",
      profile: "Профиль",
      publicProfile: "Публичный профиль",
      signIn: "Войти",
    },
    shell: {
      exploreSection: "Обзор",
      mySection: "Моё",
      menuTitle: "Навигация OverGarden",
      menuDescription: "Публичные разделы и ваш личный сад.",
      search: "Поиск",
      openMenu: "Открыть навигацию",
      closeMenu: "Закрыть навигацию",
      skipToContent: "Перейти к основному содержанию",
      siteNavigation: "Основная навигация",
      mobileNavigation: "Основная мобильная навигация",
      contextTitle: "Дальше",
      contextDescription:
        "Продолжайте читать публичные истории или откройте свой журнал.",
      startJournal: "Начать журнал",
      privacy: "Конфиденциальность",
      account: "Аккаунт",
      loadingTitle: "Загрузка OverGarden",
      errorEyebrow: "Не удалось открыть раздел",
      errorTitle: "Не удалось загрузить эту страницу",
      errorDescription:
        "Попробуйте ещё раз. Если ошибка повторится, вы сможете продолжить навигацию по OverGarden.",
      retry: "Повторить",
      languageControlLabel: "Выбор языка интерфейса",
      languageControlTrigger: "Сменить язык",
      primaryAction: "Новая запись",
      footerNavigation: "Навигация в подвале",
      contextRail: "Дополнительный контекст",
      accountRegion: "Аккаунт",
      footerTagline:
        "Публичный журнал садоводства: каждая запись открыта и видна в поиске.",
      support: "Поддержка",
      firstPublicationDisclosure: "Раскрытие первой публикации",
      sourcesTitle: "Источники данных",
      sourcesDescription:
        "Названия организмов — из Catalogue of Life; реестровые данные — из EPPO Global Database. Фотографии принадлежат их авторам.",
      openAccount: "Открыть меню аккаунта",
    },
    workspace: {
      title: "Пространство сада",
      returningDescription:
        "Ваши живые объекты, последние изменения и следующее действие в журнале в одном личном месте.",
      emptyDescription:
        "Начните с одного личного живого объекта, а затем возвращайтесь сюда каждый раз, когда его история меняется.",
    },
    object: {
      gardenJournal: "Садовый журнал",
      livingObject: "Живой объект",
      backToJournal: "Назад к журналу",
    },
  },
} satisfies Record<InterfaceLocale, InterfaceCopy>;

export function normalizeInterfaceLocale(
  value: LocaleCandidate,
): InterfaceLocale | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  return isPublicLocale(normalized) ? normalized : null;
}

export type InterfaceLocaleResolutionSource =
  | "explicit"
  | "route"
  | "persisted"
  | "market-default";

export interface ResolvedInterfaceLocalization {
  market: InterfaceMarket;
  locale: InterfaceLocale;
  marketSource: "explicit" | InterfaceMarketResolutionSource;
  localeSource: InterfaceLocaleResolutionSource;
}

export type InterfaceLocalizationHint = Pick<
  ResolvedInterfaceLocalization,
  "market" | "locale"
>;

export function serializeInterfaceLocalizationHint(
  input: InterfaceLocalizationHint,
) {
  if (!isInterfaceLocaleAllowed(input.market, input.locale)) {
    throw new Error("Interface localization hint must be market-valid.");
  }
  return `${input.market}:${input.locale}`;
}

export function parseInterfaceLocalizationHint(
  value: string | null | undefined,
): InterfaceLocalizationHint | null {
  if (typeof value !== "string") return null;
  const [marketValue, localeValue, extra] = value.split(":");
  if (extra !== undefined) return null;
  const market = normalizeInterfaceMarket(marketValue);
  const locale = normalizeInterfaceLocale(localeValue);
  if (!market || !locale || !isInterfaceLocaleAllowed(market, locale)) {
    return null;
  }
  return { market, locale };
}

export interface ResolveInterfaceLocalizationInput {
  explicitMarket?: LocaleCandidate;
  explicitLocale?: LocaleCandidate;
  routeLocale?: LocaleCandidate;
  persistedMarket?: LocaleCandidate;
  persistedLocale?: LocaleCandidate;
  countryCode?: string | null;
  acceptLanguage?: string | null;
}

export function resolveInterfaceLocalization(
  input: ResolveInterfaceLocalizationInput,
): ResolvedInterfaceLocalization {
  const explicitMarket = normalizeInterfaceMarket(input.explicitMarket);
  const marketResolution = explicitMarket
    ? { market: explicitMarket, source: "explicit" as const }
    : resolveInterfaceMarket({
        routeLocale: input.routeLocale,
        countryCode: input.countryCode,
        persistedMarket: input.persistedMarket,
      });
  const { market } = marketResolution;

  const localeCandidates: Array<{
    source: Exclude<InterfaceLocaleResolutionSource, "market-default">;
    value: LocaleCandidate;
  }> = [
    { source: "explicit", value: input.explicitLocale },
    { source: "route", value: input.routeLocale },
    { source: "persisted", value: input.persistedLocale },
  ];

  for (const candidate of localeCandidates) {
    const locale = normalizeInterfaceLocale(candidate.value);
    if (locale && isInterfaceLocaleAllowed(market, locale)) {
      return {
        market,
        locale,
        marketSource: marketResolution.source,
        localeSource: candidate.source,
      };
    }
  }

  return {
    market,
    locale: getDefaultInterfaceLocale(market),
    marketSource: marketResolution.source,
    localeSource: "market-default",
  };
}

export function resolveInterfaceLocale(
  input: ResolveInterfaceLocalizationInput,
): InterfaceLocale {
  return resolveInterfaceLocalization(input).locale;
}

export function getInterfaceCopy(
  locale: InterfaceLocale = DEFAULT_PUBLIC_LOCALE,
): InterfaceCopy {
  return INTERFACE_COPY[locale];
}
