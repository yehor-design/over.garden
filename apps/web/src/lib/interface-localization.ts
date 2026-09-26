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
  /**
   * Only the labels the shell renders. A label nobody reads is still
   * translated and reviewed, and it keeps a word the product dropped — a
   * "Drafts" entry for gardeners who have no drafts — alive in three languages.
   */
  navigation: {
    feed: string;
    explore: string;
    activity: string;
    gardenShort: string;
    catalogue: string;
    communities: string;
    knowledge: string;
    myGarden: string;
    followedFeed: string;
    bookmarks: string;
    lineageClaims: string;
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
    privacy: string;
    account: string;
    loadingTitle: string;
    errorEyebrow: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
    languageControlLabel: string;
    languageControlTrigger: string;
    /** The account menu's two groups, above the owner's (ADR-0022 D7). */
    accountPagesSection: string;
    accountSettingsSection: string;
    /** The account's settings and its sign-in page (`OVE-503`). */
    accountSettings: string;
    accountSecurity: string;
    erasureRequest: string;
    /** The chrome's own answer when the session store could not be reached. */
    sessionUnavailable: string;
    sessionUnavailableRetry: string;
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
    /** The three documents a person accepts once (`OVE-526`). */
    terms: string;
    cookies: string;
    sourcesTitle: string;
    sourcesDescription: string;
    openAccount: string;
  };
  /** The command palette of DESIGN.md §5.2. */
  palette: {
    open: string;
    title: string;
    description: string;
    placeholder: string;
    close: string;
    groups: {
      journals: string;
      organisms: string;
      gardeners: string;
      communities: string;
      actions: string;
    };
    /** Announced once per settled query, never once per keystroke. */
    resultCount: string;
    emptyTitle: string;
    emptyDescription: string;
    recent: string;
    clearRecent: string;
    hintNavigate: string;
    hintOpen: string;
    hintClose: string;
    unavailable: string;
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
        "Керуйте власними просторами й об’єктами та публікуйте спостереження для всіх.",
    },
    navigation: {
      feed: "Стрічка",
      explore: "Огляд",
      activity: "Події",
      gardenShort: "Мій сад",
      catalogue: "Каталог",
      communities: "Спільноти",
      knowledge: "Знання",
      myGarden: "Мій сад",
      followedFeed: "Стрічка підписок",
      bookmarks: "Закладки",
      lineageClaims: "Запити щодо походження",
      publicProfile: "Публічний профіль",
      signIn: "Увійти",
    },
    shell: {
      sessionUnavailable: "Не вдалося перевірити сесію",
      sessionUnavailableRetry: "Спробувати ще раз",
      accountPagesSection: "Мої сторінки",
      accountSettingsSection: "Налаштування",
      accountSettings: "Налаштування",
      accountSecurity: "Вхід і безпека",
      erasureRequest: "Видалення даних",
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
      privacy: "Приватність",
      // «Акаунт», never «обліковий запис»: «запис» is a journal entry here.
      account: "Акаунт",
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
      accountRegion: "Акаунт",
      footerTagline:
        "Публічний журнал садівництва: кожен запис відкритий і може з’являтися в пошуку.",
      support: "Підтримка",
      terms: "Умови використання",
      cookies: "Правила cookies",
      sourcesTitle: "Джерела даних",
      sourcesDescription:
        "Назви організмів — з Catalogue of Life; реєстрові дані — з EPPO Global Database. Світлини належать їхнім авторам.",
      openAccount: "Відкрити меню акаунта",
    },
    palette: {
      open: "Пошук",
      title: "Пошук в OverGarden",
      description:
        "Журнали, організми, садівники, спільноти та дії — в одному місці.",
      placeholder: "Що шукаєте?",
      close: "Закрити пошук",
      groups: {
        journals: "Журнали",
        organisms: "Організми",
        gardeners: "Садівники",
        communities: "Спільноти",
        actions: "Дії",
      },
      resultCount: "Знайдено результатів",
      emptyTitle: "Нічого не знайдено",
      emptyDescription:
        "Спробуйте інше слово або відкрийте повний пошук у журналах чи каталозі.",
      recent: "Нещодавні запити",
      clearRecent: "Очистити нещодавні",
      hintNavigate: "↑ ↓ — переміщення",
      hintOpen: "Enter — відкрити",
      hintClose: "Esc — закрити",
      unavailable:
        "Пошук зараз недоступний. Повні сторінки пошуку працюють як завжди.",
    },
    workspace: {
      title: "Простір саду",
      returningDescription:
        "Ваші об’єкти, простори й опубліковані спостереження в одному місці.",
      emptyDescription:
        "Додайте свій перший об’єкт і публікуйте спостереження, коли щось змінюється.",
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
        "Управлявайте своите пространства и обекти и публикувайте наблюдения за всички.",
    },
    navigation: {
      feed: "Емисия",
      explore: "Открий",
      activity: "Известия",
      gardenShort: "Градина",
      catalogue: "Каталог",
      communities: "Общности",
      knowledge: "Знания",
      myGarden: "Моята градина",
      followedFeed: "Следвани записи",
      bookmarks: "Отметки",
      lineageClaims: "Заявки за произход",
      publicProfile: "Публичен профил",
      signIn: "Вход",
    },
    shell: {
      sessionUnavailable: "Сесията не можа да бъде проверена",
      sessionUnavailableRetry: "Опитай отново",
      accountPagesSection: "Моите страници",
      accountSettingsSection: "Настройки",
      accountSettings: "Настройки",
      accountSecurity: "Вход и сигурност",
      erasureRequest: "Изтриване на данни",
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
      privacy: "Поверителност",
      // «Акаунт», never «Профил»: a profile is the public page of a gardener.
      account: "Акаунт",
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
      accountRegion: "Акаунт",
      footerTagline:
        "Публичен дневник за градинарство: всеки запис е отворен и може да се появява в търсачките.",
      support: "Поддръжка",
      terms: "Условия за ползване",
      cookies: "Правила за бисквитките",
      sourcesTitle: "Източници на данни",
      sourcesDescription:
        "Имената на организмите са от Catalogue of Life; регистровите данни са от EPPO Global Database. Снимките принадлежат на авторите си.",
      openAccount: "Отваряне на менюто на акаунта",
    },
    palette: {
      open: "Търсене",
      title: "Търсене в OverGarden",
      description:
        "Дневници, организми, градинари, общности и действия на едно място.",
      placeholder: "Какво търсите?",
      close: "Затваряне на търсенето",
      groups: {
        journals: "Дневници",
        organisms: "Организми",
        gardeners: "Градинари",
        communities: "Общности",
        actions: "Действия",
      },
      resultCount: "Намерени резултата",
      emptyTitle: "Няма намерени резултати",
      emptyDescription:
        "Опитайте друга дума или отворете пълното търсене в дневниците или каталога.",
      recent: "Скорошни търсения",
      clearRecent: "Изчистване на скорошните",
      hintNavigate: "↑ ↓ — придвижване",
      hintOpen: "Enter — отваряне",
      hintClose: "Esc — затваряне",
      unavailable:
        "Търсенето не е достъпно в момента. Пълните страници за търсене работят както обикновено.",
    },
    workspace: {
      title: "Градинско пространство",
      returningDescription:
        "Вашите обекти, пространства и публикувани наблюдения на едно място.",
      emptyDescription:
        "Добавете първия си обект и публикувайте наблюдения, когато нещо се промени.",
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
        "Управляйте своими пространствами и объектами и публикуйте наблюдения для всех.",
    },
    navigation: {
      feed: "Лента",
      explore: "Обзор",
      activity: "События",
      gardenShort: "Мой сад",
      catalogue: "Каталог",
      communities: "Сообщества",
      knowledge: "Знания",
      myGarden: "Мой сад",
      followedFeed: "Лента подписок",
      bookmarks: "Закладки",
      lineageClaims: "Заявки о происхождении",
      publicProfile: "Публичный профиль",
      signIn: "Войти",
    },
    shell: {
      sessionUnavailable: "Не удалось проверить сессию",
      sessionUnavailableRetry: "Попробовать снова",
      accountPagesSection: "Мои страницы",
      accountSettingsSection: "Настройки",
      accountSettings: "Настройки",
      accountSecurity: "Вход и безопасность",
      erasureRequest: "Удаление данных",
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
        "Публичный журнал садоводства: каждая запись открыта и может появляться в поиске.",
      support: "Поддержка",
      terms: "Условия использования",
      cookies: "Правила cookies",
      sourcesTitle: "Источники данных",
      sourcesDescription:
        "Названия организмов — из Catalogue of Life; реестровые данные — из EPPO Global Database. Фотографии принадлежат их авторам.",
      openAccount: "Открыть меню аккаунта",
    },
    palette: {
      open: "Поиск",
      title: "Поиск в OverGarden",
      description:
        "Журналы, организмы, садовники, сообщества и действия в одном месте.",
      placeholder: "Что ищете?",
      close: "Закрыть поиск",
      groups: {
        journals: "Журналы",
        organisms: "Организмы",
        gardeners: "Садовники",
        communities: "Сообщества",
        actions: "Действия",
      },
      resultCount: "Найдено результатов",
      emptyTitle: "Ничего не найдено",
      emptyDescription:
        "Попробуйте другое слово или откройте полный поиск в журналах либо в каталоге.",
      recent: "Недавние запросы",
      clearRecent: "Очистить недавние",
      hintNavigate: "↑ ↓ — перемещение",
      hintOpen: "Enter — открыть",
      hintClose: "Esc — закрыть",
      unavailable:
        "Поиск сейчас недоступен. Полные страницы поиска работают как обычно.",
    },
    workspace: {
      title: "Пространство сада",
      returningDescription:
        "Ваши объекты, пространства и опубликованные наблюдения в одном месте.",
      emptyDescription:
        "Добавьте свой первый объект и публикуйте наблюдения, когда что-то меняется.",
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
