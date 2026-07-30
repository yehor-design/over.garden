import type { InterfaceLocale } from "@/lib/interface-localization";

export type PublicCountKind = "entry" | "photo" | "publicEntry" | "like";

interface PublicSurfaceCopy {
  accessibility: {
    languageSwitcher: string;
  };
  analyticsConsent: {
    label: string;
    message: string;
    accept: string;
    decline: string;
  };
  journal: {
    entryType: string;
    metadataTitleSuffix: string;
    objectPassport: string;
    backToJournals: string;
    primaryNavigation: string;
    entryMetadata: string;
    spaceEntryPrefix: string;
    spaceLogbook: string;
    objectLogbook: string;
    locationHidden: string;
    openObjectPassport: string;
    startComparableJournal: string;
    journalContext: string;
    space: string;
    livingObject: string;
    catalogIdentity: string;
    publicLocation: string;
    hidden: string;
    caretaker: string;
    defaultCaretaker: string;
    journalEntry: string;
    entryNote: string;
    regionPrefix: string;
    entryRemoved: string;
    entryRemovedDescription: string;
    entryNotFound: string;
    entryNotFoundDescription: string;
    spaceLevelUpdate: string;
    catalogMatchPending: string;
    relatedPublicContext: string;
    followObjectHistory: string;
    catalogMatch: string;
    publicVariety: string;
    caretakerProfile: string;
    variety: string;
  };
  engagement: {
    like: string;
    bookmark: string;
    follow: string;
    unfollow: string;
    comment: string;
    reply: string;
    noComments: string;
    liked: string;
    unliked: string;
    likeRateLimited: string;
    commentRateLimited: string;
    interactionUnavailable: string;
    bookmarked: string;
    bookmarkRemoved: string;
    commented: string;
    followed: string;
    unfollowed: string;
    deleteComment: string;
    reportComment: string;
    blockAuthor: string;
    commentDeleted: string;
    commentReported: string;
    commentAuthorBlocked: string;
    commentUnavailable: string;
    commentPreciseLocation: string;
    showMoreComments: string;
    signInComplete: string;
    moreActions: string;
    reportReasons: {
      spam: string;
      harassment: string;
      privacy: string;
      misinformation: string;
      other: string;
    };
  };
  passport: {
    title: string;
    metadataSuffix: string;
    publicJournal: string;
    latestUpdate: string;
    catalogState: string;
    catalogIdentity: string;
    location: string;
    caretaker: string;
    hidden: string;
    defaultCaretaker: string;
    startOwnRecord: string;
    openCatalogMatch: string;
    noPublicPhoto: string;
    publicPhotoSuffix: string;
    recentPublicJournal: string;
    logbookPreview: string;
    noPublicJournalEntries: string;
    openJournalEntry: string;
    showMoreJournalEntries: string;
    relatedPublicContext: string;
    exploreObject: string;
    catalogMatch: string;
    publicCatalog: string;
    objectHistory: string;
    confirmedProvenance: string;
    publicLineage: string;
    publicLineageDescription: string;
    noConfirmedPublicLineage: string;
    source: string;
    grownObject: string;
    depth: string;
    lineageUpdatesFrom: string;
    lineageQuestionSafety: string;
    lineageQuestionRateLimited: string;
    interactionUnavailable: string;
    followUpdates: string;
    followRequiresWriteAccess: string;
    askWithinLineage: string;
    lineageQuestionPlaceholder: string;
    sendQuestion: string;
  };
  variety: {
    title: string;
    metadataSuffix: string;
    collectionPageSuffix: string;
    logThisVariety: string;
    saveToWishlist: string;
    savedToWishlist: string;
    growingNote: string;
    openSourceEntry: string;
  };
  profile: {
    title: string;
    metadataSuffix: string;
    publicEntries: string;
    publicObjects: string;
    confirmedLineageLinks: string;
    publicJournalLinks: string;
    publicJournalLinksDescription: string;
    noPublicJournalLinks: string;
    publicJournalEntry: string;
    avatarSuffix: string;
  };
  sourceCredits: {
    versionLabel: string;
    dataSources: string;
    title: string;
    attributionRequired: string;
  };
  notFound: {
    title: string;
    home: string;
  };
}

type CountForms = Record<"one" | "few" | "many" | "other", string>;

const COPY = {
  uk: {
    accessibility: { languageSwitcher: "Змінити мову" },
    analyticsConsent: {
      label: "Згода на аналітику",
      message:
        "Ми використовуємо Google Tag Manager для аналітики лише на публічних, юридичних сторінках і сторінках підтримки, щоб зрозуміти, що допомагає садівникам знаходити OverGarden. За згодою Microsoft Clarity також може надавати інсайти про сесії на тих самих сторінках. Ці інструменти не працюють у приватному саду, автентифікації, адмінці, запрошеннях, запитах на видалення, журналі, походженні, API або callback-маршрутах.",
      accept: "Прийняти аналітику",
      decline: "Відхилити",
    },
    journal: {
      entryType: "Запис у журналі живого об'єкта",
      metadataTitleSuffix: "запис у журналі",
      objectPassport: "Паспорт об'єкта",
      backToJournals: "Назад до журналів",
      primaryNavigation: "Основна навігація",
      entryMetadata: "Метадані запису",
      spaceEntryPrefix: "Запис простору",
      spaceLogbook: "Журнал простору",
      objectLogbook: "Журнал об'єкта",
      locationHidden: "Місце приховано",
      openObjectPassport: "Відкрити паспорт живого об'єкта",
      startComparableJournal: "Почати подібний журнал",
      journalContext: "Контекст журналу",
      space: "Простір",
      livingObject: "Живий об'єкт",
      catalogIdentity: "Каталожна ідентичність",
      publicLocation: "Публічне місце",
      hidden: "Приховано",
      caretaker: "Доглядальник",
      defaultCaretaker: "садівник OverGarden",
      journalEntry: "Запис журналу",
      entryNote: "Нотатка запису",
      regionPrefix: "Регіон",
      entryRemoved: "Запис видалено",
      entryRemovedDescription: "Цей публічний запис садового журналу видалено.",
      entryNotFound: "Запис не знайдено",
      entryNotFoundDescription: "Цей запис садового журналу недоступний.",
      spaceLevelUpdate: "Оновлення рівня простору",
      catalogMatchPending: "Очікується збіг у каталозі",
      relatedPublicContext: "Пов'язаний публічний контекст",
      followObjectHistory: "Переглянути історію об'єкта",
      catalogMatch: "Збіг у каталозі",
      publicVariety: "Публічний сорт",
      caretakerProfile: "Профіль доглядальника",
      variety: "Сорт",
    },
    engagement: {
      like: "Подобається",
      bookmark: "Зберегти",
      follow: "Стежити",
      unfollow: "Не стежити",
      comment: "Коментар",
      reply: "Відповісти",
      noComments: "Коментарів ще немає.",
      liked: "Позначено вподобанням.",
      unliked: "Вподобання прибрано.",
      likeRateLimited: "Забагато змін уподобання. Спробуйте пізніше.",
      commentRateLimited:
        "Забагато коментарів за короткий час. Спробуйте пізніше.",
      interactionUnavailable:
        "Дію тимчасово не вдалося виконати. Спробуйте ще раз.",
      bookmarked: "Збережено в закладках.",
      bookmarkRemoved: "Прибрано із закладок.",
      commented: "Коментар опубліковано.",
      followed: "Ви стежите за оновленнями.",
      unfollowed: "Підписку скасовано.",
      deleteComment: "Видалити коментар",
      reportComment: "Поскаржитися",
      blockAuthor: "Заблокувати автора",
      commentDeleted: "Коментар видалено.",
      commentReported: "Скаргу надіслано на розгляд.",
      commentAuthorBlocked: "Автора заблоковано.",
      commentUnavailable: "Коментар більше недоступний.",
      commentPreciseLocation:
        "Приберіть точні координати з коментаря. Опишіть місце лише регіоном.",
      showMoreComments: "Показати більше коментарів",
      signInComplete: "Вхід завершено. Підтвердьте дію нижче, щоб продовжити.",
      moreActions: "Інші дії",
      reportReasons: {
        spam: "Спам",
        harassment: "Переслідування",
        privacy: "Порушення приватності",
        misinformation: "Недостовірна інформація",
        other: "Інше",
      },
    },
    passport: {
      title: "Публічний паспорт живого об'єкта",
      metadataSuffix: "живий об'єкт",
      publicJournal: "Публічний журнал",
      latestUpdate: "Останнє оновлення",
      catalogState: "Стан каталогу",
      catalogIdentity: "Каталожна ідентичність",
      location: "Місце",
      caretaker: "Доглядальник",
      hidden: "Приховано",
      defaultCaretaker: "садівник OverGarden",
      startOwnRecord: "Почати власний запис",
      openCatalogMatch: "Відкрити збіг у каталозі",
      noPublicPhoto: "Публічного фото ще немає",
      publicPhotoSuffix: "публічне фото",
      recentPublicJournal: "Останні публічні записи",
      logbookPreview: "Попередній перегляд журналу",
      noPublicJournalEntries:
        "Для цього об'єкта ще немає публічних записів журналу.",
      openJournalEntry: "Відкрити запис журналу",
      showMoreJournalEntries: "Показати ще записи",
      relatedPublicContext: "Пов'язаний публічний контекст",
      exploreObject: "Досліджуйте цей об'єкт",
      catalogMatch: "Збіг у каталозі",
      publicCatalog: "Публічний каталог",
      objectHistory: "Історія об'єкта",
      confirmedProvenance: "Підтверджене походження",
      publicLineage: "Публічне походження",
      publicLineageDescription:
        "Тут показані лише підтверджені зв'язки об'єктів, підкріплені активними публічними записами журналу.",
      noConfirmedPublicLineage:
        "Для цього об'єкта ще немає підтвердженого публічного походження.",
      source: "Джерело",
      grownObject: "Вирощений об'єкт",
      depth: "Глибина",
      lineageUpdatesFrom: "Оновлення походження від",
      lineageQuestionSafety:
        "Запитання залишаються в межах цього підтвердженого ланцюга та не містять контактних даних.",
      lineageQuestionRateLimited:
        "Забагато запитань за короткий час. Спробуйте пізніше.",
      interactionUnavailable:
        "Дію тимчасово не вдалося виконати. Спробуйте ще раз.",
      followUpdates: "Стежити за оновленнями",
      followRequiresWriteAccess:
        "Щоб стежити за цим походженням, потрібен чинний доступ до записів.",
      askWithinLineage: "Запитати в межах походження",
      lineageQuestionPlaceholder: "Що варто знати про цю лінію?",
      sendQuestion: "Надіслати запитання",
    },
    variety: {
      title: "Публічний сорт",
      metadataSuffix: "сорт",
      collectionPageSuffix: "публічні записи саду",
      logThisVariety: "Записати цей сорт",
      saveToWishlist: "Зберегти до списку бажань",
      savedToWishlist: "Збережено до вашого списку бажань.",
      growingNote: "Нотатка про вирощування",
      openSourceEntry: "Відкрити вихідний запис",
    },
    profile: {
      title: "Публічний профіль садівника",
      metadataSuffix: "публічний профіль",
      publicEntries: "Публічні записи",
      publicObjects: "Публічні об'єкти",
      confirmedLineageLinks: "Підтверджені зв'язки походження",
      publicJournalLinks: "Посилання на публічний журнал",
      publicJournalLinksDescription:
        "Тут показані лише активні URL публічного журналу.",
      noPublicJournalLinks:
        "Для цього профілю ще немає посилань на публічний журнал.",
      publicJournalEntry: "Публічний запис журналу",
      avatarSuffix: "аватар",
    },
    sourceCredits: {
      versionLabel: "Версія",
      dataSources: "Джерела даних",
      title: "Джерела та визнання",
      attributionRequired: "Потрібне зазначення джерела",
    },
    notFound: {
      title: "Сторінку не знайдено",
      home: "До OverGarden",
    },
  },
  bg: {
    accessibility: { languageSwitcher: "Смяна на езика" },
    analyticsConsent: {
      label: "Съгласие за анализ",
      message:
        "Използваме Google Tag Manager за анализ само на публични, правни и страници за поддръжка, за да разберем какво помага на градинарите да достигнат OverGarden. След съгласие Microsoft Clarity може също да предоставя данни за сесиите на същите страници. Тези инструменти не работят в личната градина, удостоверяването, администрацията, поканите, изтриването, дневника, произхода, API или callback маршрутите.",
      accept: "Приемете аналитиката",
      decline: "Откажете",
    },
    journal: {
      entryType: "Запис в дневника на жив обект",
      metadataTitleSuffix: "запис в градински дневник",
      objectPassport: "Паспорт на обекта",
      backToJournals: "Назад към дневниците",
      primaryNavigation: "Основна навигация",
      entryMetadata: "Метаданни на записа",
      spaceEntryPrefix: "Запис за пространство",
      spaceLogbook: "Дневник на пространството",
      objectLogbook: "Дневник на обекта",
      locationHidden: "Мястото е скрито",
      openObjectPassport: "Отворете паспорта на живия обект",
      startComparableJournal: "Започнете подобен дневник",
      journalContext: "Контекст на дневника",
      space: "Пространство",
      livingObject: "Жив обект",
      catalogIdentity: "Каталожна идентичност",
      publicLocation: "Публично местоположение",
      hidden: "Скрито",
      caretaker: "Грижещ се",
      defaultCaretaker: "градинар от OverGarden",
      journalEntry: "Запис в дневника",
      entryNote: "Бележка към записа",
      regionPrefix: "Регион",
      entryRemoved: "Записът е премахнат",
      entryRemovedDescription:
        "Този публичен запис в градинския дневник е премахнат.",
      entryNotFound: "Записът не е намерен",
      entryNotFoundDescription: "Този запис в градинския дневник не е наличен.",
      spaceLevelUpdate: "Обновяване на ниво пространство",
      catalogMatchPending: "Очаква се съвпадение в каталога",
      relatedPublicContext: "Свързан публичен контекст",
      followObjectHistory: "Проследете историята на обекта",
      catalogMatch: "Съвпадение в каталога",
      publicVariety: "Публичен сорт",
      caretakerProfile: "Профил на грижещия се",
      variety: "Сорт",
    },
    engagement: {
      like: "Харесвам",
      bookmark: "Запази",
      follow: "Следвай",
      unfollow: "Спри следването",
      comment: "Коментар",
      reply: "Отговор",
      noComments: "Все още няма коментари.",
      liked: "Харесано.",
      unliked: "Харесването е премахнато.",
      likeRateLimited:
        "Твърде много промени на харесването. Опитайте по-късно.",
      commentRateLimited:
        "Твърде много коментари за кратко време. Опитайте по-късно.",
      interactionUnavailable:
        "Действието временно не можа да бъде изпълнено. Опитайте отново.",
      bookmarked: "Запазено в отметките.",
      bookmarkRemoved: "Премахнато от отметките.",
      commented: "Коментарът е публикуван.",
      followed: "Следите новите публикации.",
      unfollowed: "Следването е прекратено.",
      deleteComment: "Изтрий коментара",
      reportComment: "Докладвай",
      blockAuthor: "Блокирай автора",
      commentDeleted: "Коментарът е изтрит.",
      commentReported: "Сигналът е изпратен за преглед.",
      commentAuthorBlocked: "Авторът е блокиран.",
      commentUnavailable: "Коментарът вече не е достъпен.",
      commentPreciseLocation:
        "Премахнете точните координати от коментара. Опишете мястото само с регион.",
      showMoreComments: "Покажи още коментари",
      signInComplete:
        "Влизането е завършено. Потвърдете действието по-долу, за да продължите.",
      moreActions: "Още действия",
      reportReasons: {
        spam: "Спам",
        harassment: "Тормоз",
        privacy: "Нарушаване на поверителността",
        misinformation: "Невярна информация",
        other: "Друго",
      },
    },
    passport: {
      title: "Публичен паспорт на жив обект",
      metadataSuffix: "жив обект",
      publicJournal: "Публичен дневник",
      latestUpdate: "Последно обновяване",
      catalogState: "Състояние на каталога",
      catalogIdentity: "Каталожна идентичност",
      location: "Място",
      caretaker: "Грижещ се",
      hidden: "Скрито",
      defaultCaretaker: "градинар от OverGarden",
      startOwnRecord: "Започнете собствен запис",
      openCatalogMatch: "Отворете съвпадението в каталога",
      noPublicPhoto: "Все още няма публична снимка",
      publicPhotoSuffix: "публична снимка",
      recentPublicJournal: "Последни публични записи",
      logbookPreview: "Преглед на дневника",
      noPublicJournalEntries:
        "За този обект все още няма публични записи в дневника.",
      openJournalEntry: "Отворете записа в дневника",
      showMoreJournalEntries: "Покажи още записи",
      relatedPublicContext: "Свързан публичен контекст",
      exploreObject: "Разгледайте около този обект",
      catalogMatch: "Съвпадение в каталога",
      publicCatalog: "Публичен каталог",
      objectHistory: "История на обекта",
      confirmedProvenance: "Потвърден произход",
      publicLineage: "Публичен произход",
      publicLineageDescription:
        "Този раздел показва само потвърдени връзки между обекти, подкрепени от активни публични записи в дневника.",
      noConfirmedPublicLineage:
        "За този обект все още няма потвърден публичен произход.",
      source: "Източник",
      grownObject: "Отглеждан обект",
      depth: "Дълбочина",
      lineageUpdatesFrom: "Обновявания на произхода от",
      lineageQuestionSafety:
        "Въпросите остават в тази потвърдена верига и не съдържат данни за контакт.",
      lineageQuestionRateLimited:
        "Твърде много въпроси за кратко време. Опитайте по-късно.",
      interactionUnavailable:
        "Действието временно не можа да бъде изпълнено. Опитайте отново.",
      followUpdates: "Следете обновяванията",
      followRequiresWriteAccess:
        "За да следите този произход, е необходим активен достъп за записване.",
      askWithinLineage: "Попитайте в рамките на произхода",
      lineageQuestionPlaceholder: "Какво трябва да знам за тази линия?",
      sendQuestion: "Изпратете въпроса",
    },
    variety: {
      title: "Публичен сорт",
      metadataSuffix: "сорт",
      collectionPageSuffix: "публични записи в градината",
      logThisVariety: "Запишете този сорт",
      saveToWishlist: "Запазете в списъка с желания",
      savedToWishlist: "Запазено в списъка ви с желания.",
      growingNote: "Бележка за отглеждане",
      openSourceEntry: "Отворете изходния запис",
    },
    profile: {
      title: "Публичен профил на градинар",
      metadataSuffix: "публичен профил",
      publicEntries: "Публични записи",
      publicObjects: "Публични обекти",
      confirmedLineageLinks: "Потвърдени връзки за произход",
      publicJournalLinks: "Връзки към публичен дневник",
      publicJournalLinksDescription:
        "Тук се показват само активни URL адреси на публичния дневник.",
      noPublicJournalLinks:
        "За този профил все още няма връзки към публичен дневник.",
      publicJournalEntry: "Публичен запис в дневника",
      avatarSuffix: "аватар",
    },
    sourceCredits: {
      versionLabel: "Версия",
      dataSources: "Източници на данни",
      title: "Източници и признание",
      attributionRequired: "Посочването на източника е задължително",
    },
    notFound: {
      title: "Страницата не е намерена",
      home: "Към OverGarden",
    },
  },
  ru: {
    accessibility: { languageSwitcher: "Сменить язык" },
    analyticsConsent: {
      label: "Согласие на использование аналитики",
      message:
        "Мы используем Google Tag Manager для аналитики только на публичных, юридических страницах и страницах поддержки, чтобы понять, что помогает садоводам находить OverGarden. С согласия Microsoft Clarity также может предоставлять сведения о сессиях на этих же страницах. Эти инструменты не работают в личном саду, аутентификации, админке, приглашениях, удалении данных, журнале, происхождении, API или callback-маршрутах.",
      accept: "Принять аналитику",
      decline: "Отклонить",
    },
    journal: {
      entryType: "Запись в журнале живого объекта",
      metadataTitleSuffix: "запись в садовом журнале",
      objectPassport: "Паспорт объекта",
      backToJournals: "Назад к журналам",
      primaryNavigation: "Основная навигация",
      entryMetadata: "Метаданные записи",
      spaceEntryPrefix: "Запись пространства",
      spaceLogbook: "Журнал пространства",
      objectLogbook: "Журнал объекта",
      locationHidden: "Место скрыто",
      openObjectPassport: "Открыть паспорт живого объекта",
      startComparableJournal: "Начать похожий журнал",
      journalContext: "Контекст журнала",
      space: "Пространство",
      livingObject: "Живой объект",
      catalogIdentity: "Каталожная идентичность",
      publicLocation: "Публичное место",
      hidden: "Скрыто",
      caretaker: "Ухаживающий",
      defaultCaretaker: "садовод OverGarden",
      journalEntry: "Запись журнала",
      entryNote: "Заметка к записи",
      regionPrefix: "Регион",
      entryRemoved: "Запись удалена",
      entryRemovedDescription: "Эта публичная запись садового журнала удалена.",
      entryNotFound: "Запись не найдена",
      entryNotFoundDescription: "Эта запись садового журнала недоступна.",
      spaceLevelUpdate: "Обновление уровня пространства",
      catalogMatchPending: "Ожидается совпадение в каталоге",
      relatedPublicContext: "Связанный публичный контекст",
      followObjectHistory: "Проследить историю объекта",
      catalogMatch: "Совпадение в каталоге",
      publicVariety: "Публичный сорт",
      caretakerProfile: "Профиль ухаживающего",
      variety: "Сорт",
    },
    engagement: {
      like: "Нравится",
      bookmark: "Сохранить",
      follow: "Подписаться",
      unfollow: "Отписаться",
      comment: "Комментарий",
      reply: "Ответить",
      noComments: "Комментариев пока нет.",
      liked: "Отмечено как понравившееся.",
      unliked: "Отметка нравится удалена.",
      likeRateLimited:
        "Слишком много изменений отметки нравится. Попробуйте позже.",
      commentRateLimited:
        "Слишком много комментариев за короткое время. Попробуйте позже.",
      interactionUnavailable:
        "Действие временно не удалось выполнить. Попробуйте ещё раз.",
      bookmarked: "Сохранено в закладках.",
      bookmarkRemoved: "Удалено из закладок.",
      commented: "Комментарий опубликован.",
      followed: "Вы подписались на обновления.",
      unfollowed: "Подписка отменена.",
      deleteComment: "Удалить комментарий",
      reportComment: "Пожаловаться",
      blockAuthor: "Заблокировать автора",
      commentDeleted: "Комментарий удалён.",
      commentReported: "Жалоба отправлена на проверку.",
      commentAuthorBlocked: "Автор заблокирован.",
      commentUnavailable: "Комментарий больше недоступен.",
      commentPreciseLocation:
        "Уберите точные координаты из комментария. Опишите место только регионом.",
      showMoreComments: "Показать больше комментариев",
      signInComplete:
        "Вход завершён. Подтвердите действие ниже, чтобы продолжить.",
      moreActions: "Другие действия",
      reportReasons: {
        spam: "Спам",
        harassment: "Преследование",
        privacy: "Нарушение приватности",
        misinformation: "Недостоверная информация",
        other: "Другое",
      },
    },
    passport: {
      title: "Публичный паспорт живого объекта",
      metadataSuffix: "живой объект",
      publicJournal: "Публичный журнал",
      latestUpdate: "Последнее обновление",
      catalogState: "Статус каталога",
      catalogIdentity: "Каталожная идентичность",
      location: "Место",
      caretaker: "Ухаживающий",
      hidden: "Скрыто",
      defaultCaretaker: "садовод OverGarden",
      startOwnRecord: "Начать собственную запись",
      openCatalogMatch: "Открыть совпадение в каталоге",
      noPublicPhoto: "Публичного фото пока нет",
      publicPhotoSuffix: "публичное фото",
      recentPublicJournal: "Недавние публичные записи",
      logbookPreview: "Предпросмотр журнала",
      noPublicJournalEntries:
        "Для этого объекта пока нет публичных записей журнала.",
      openJournalEntry: "Открыть запись журнала",
      showMoreJournalEntries: "Показать ещё записи",
      relatedPublicContext: "Связанный публичный контекст",
      exploreObject: "Исследуйте этот объект",
      catalogMatch: "Совпадение в каталоге",
      publicCatalog: "Публичный каталог",
      objectHistory: "История объекта",
      confirmedProvenance: "Подтвержденное происхождение",
      publicLineage: "Публичное происхождение",
      publicLineageDescription:
        "В этом разделе показаны только подтвержденные связи объектов, подкрепленные активными публичными записями журнала.",
      noConfirmedPublicLineage:
        "Для этого объекта пока нет подтвержденного публичного происхождения.",
      source: "Источник",
      grownObject: "Выращенный объект",
      depth: "Глубина",
      lineageUpdatesFrom: "Обновления происхождения от",
      lineageQuestionSafety:
        "Вопросы остаются в пределах этой подтвержденной цепочки и не содержат контактных данных.",
      lineageQuestionRateLimited:
        "Слишком много вопросов за короткое время. Попробуйте позже.",
      interactionUnavailable:
        "Действие временно не удалось выполнить. Попробуйте ещё раз.",
      followUpdates: "Следить за обновлениями",
      followRequiresWriteAccess:
        "Чтобы следить за этим происхождением, нужен действующий доступ к записям.",
      askWithinLineage: "Спросить в рамках происхождения",
      lineageQuestionPlaceholder: "Что мне стоит знать об этой линии?",
      sendQuestion: "Отправить вопрос",
    },
    variety: {
      title: "Публичный сорт",
      metadataSuffix: "сорт",
      collectionPageSuffix: "Публичные записи сада",
      logThisVariety: "Записать этот сорт",
      saveToWishlist: "Сохранить в список желаний",
      savedToWishlist: "Сохранено в ваш список желаний.",
      growingNote: "Заметка о выращивании",
      openSourceEntry: "Открыть исходную запись",
    },
    profile: {
      title: "Публичный профиль садовода",
      metadataSuffix: "публичный профиль",
      publicEntries: "Публичные записи",
      publicObjects: "Публичные объекты",
      confirmedLineageLinks: "Подтвержденные связи происхождения",
      publicJournalLinks: "Ссылки на публичный журнал",
      publicJournalLinksDescription:
        "Здесь показаны только активные URL публичного журнала.",
      noPublicJournalLinks:
        "Для этого профиля пока нет ссылок на публичный журнал.",
      publicJournalEntry: "Публичная запись журнала",
      avatarSuffix: "аватар",
    },
    sourceCredits: {
      versionLabel: "Версия",
      dataSources: "Источники данных",
      title: "Источники и указание авторства",
      attributionRequired: "Требуется указание источника",
    },
    notFound: {
      title: "Страница не найдена",
      home: "К OverGarden",
    },
  },
} satisfies Record<InterfaceLocale, PublicSurfaceCopy>;

const COUNT_FORMS: Record<
  InterfaceLocale,
  Record<PublicCountKind, CountForms>
> = {
  uk: {
    entry: {
      one: "запис",
      few: "записи",
      many: "записів",
      other: "запису",
    },
    photo: { one: "фото", few: "фото", many: "фото", other: "фото" },
    publicEntry: {
      one: "публічний запис",
      few: "публічні записи",
      many: "публічних записів",
      other: "публічного запису",
    },
    like: {
      one: "вподобання",
      few: "вподобання",
      many: "вподобань",
      other: "вподобання",
    },
  },
  bg: {
    entry: {
      one: "запис",
      few: "записа",
      many: "записа",
      other: "записа",
    },
    photo: {
      one: "снимка",
      few: "снимки",
      many: "снимки",
      other: "снимки",
    },
    publicEntry: {
      one: "публичен запис",
      few: "публични записа",
      many: "публични записа",
      other: "публични записа",
    },
    like: {
      one: "харесване",
      few: "харесвания",
      many: "харесвания",
      other: "харесвания",
    },
  },
  ru: {
    entry: {
      one: "запись",
      few: "записи",
      many: "записей",
      other: "записи",
    },
    photo: { one: "фото", few: "фото", many: "фото", other: "фото" },
    publicEntry: {
      one: "публичная запись",
      few: "публичные записи",
      many: "публичных записей",
      other: "публичной записи",
    },
    like: {
      one: "отметка нравится",
      few: "отметки нравится",
      many: "отметок нравится",
      other: "отметки нравится",
    },
  },
};

export function getPublicSurfaceCopy(locale: InterfaceLocale) {
  return COPY[locale];
}

export function formatPublicCount(
  locale: InterfaceLocale,
  kind: PublicCountKind,
  count: number,
) {
  const category = new Intl.PluralRules(locale).select(count);
  const forms = COUNT_FORMS[locale][kind];
  const form = forms[category as keyof CountForms] ?? forms.other;

  return `${count} ${form}`;
}

export function publicObjectKindLabel(
  locale: InterfaceLocale,
  value: string | null | undefined,
) {
  const labels = {
    uk: { plant: "Рослина", animal: "Тварина" },
    bg: { plant: "Растение", animal: "Животно" },
    ru: { plant: "Растение", animal: "Животное" },
  } satisfies Record<InterfaceLocale, Record<"plant" | "animal", string>>;
  const copy = labels[locale];

  if (value === "animal") return copy.animal;
  return copy.plant;
}

export function publicCatalogIdentityLabel(
  locale: InterfaceLocale,
  value: string | null | undefined,
  objectKind?: string | null,
  catalogSource?: string | null,
) {
  const labels = {
    uk: {
      catalog: "Каталог",
      plantSpecies: "Вид рослини",
      plantVariety: "Сорт рослини",
      breed: "Порода",
      animalBreed: "Порода тварини",
      beeBreed: "Порода бджіл",
    },
    bg: {
      catalog: "Каталог",
      plantSpecies: "Растителен вид",
      plantVariety: "Растителен сорт",
      breed: "Порода",
      animalBreed: "Порода животно",
      beeBreed: "Пчелна порода",
    },
    ru: {
      catalog: "Каталог",
      plantSpecies: "Вид растения",
      plantVariety: "Сорт растения",
      breed: "Порода",
      animalBreed: "Порода животного",
      beeBreed: "Порода пчёл",
    },
  } satisfies Record<InterfaceLocale, Record<string, string>>;
  const copy = labels[locale];

  if (value === "species") return copy.plantSpecies;
  if (value === "plant_variety") return copy.plantVariety;
  if (value !== "breed") return copy.catalog;
  if (catalogSource === "ua_official_bee_breed") return copy.beeBreed;
  if (
    objectKind === "animal" ||
    catalogSource === "vertebrate_breed_ontology"
  ) {
    return copy.animalBreed;
  }
  return copy.breed;
}

export function publicVarietyStateLabel(
  locale: InterfaceLocale,
  value: string | null | undefined,
) {
  const labels = {
    uk: {
      selected: "Зіставлено з каталогом",
      userAdded: "Збережено з вашою назвою з каталогу",
      freeText: "Збережено без збігу в каталозі",
      unknown: "Збігу в каталозі ще немає",
      fallback: "Збіг у каталозі не задано",
    },
    bg: {
      selected: "Съвпада с каталога",
      userAdded: "Запазено с вашето каталожно име",
      freeText: "Запазено без съвпадение в каталога",
      unknown: "Все още няма съвпадение в каталога",
      fallback: "Няма зададено съвпадение в каталога",
    },
    ru: {
      selected: "Сопоставлено с каталогом",
      userAdded: "Сохранено с вашим каталоговым именем",
      freeText: "Сохранено без совпадения в каталоге",
      unknown: "Совпадения в каталоге пока нет",
      fallback: "Совпадение в каталоге не задано",
    },
  } satisfies Record<InterfaceLocale, Record<string, string>>;
  const copy = labels[locale];

  if (value === "selected") return copy.selected;
  if (value === "user_added") return copy.userAdded;
  if (value === "free_text") return copy.freeText;
  if (value === "unknown") return copy.unknown;
  return copy.fallback;
}

export function publicCatalogStatusLabel(
  locale: InterfaceLocale,
  value: string | null | undefined,
) {
  const labels = {
    uk: {
      confirmed: "Курований каталог",
      seeded: "Пілотний каталог",
      fallback: "Каталожна ідентичність",
    },
    bg: {
      confirmed: "Куриран каталог",
      seeded: "Пилотен каталог",
      fallback: "Каталожна идентичност",
    },
    ru: {
      confirmed: "Курируемый каталог",
      seeded: "Пилотный каталог",
      fallback: "Каталожная идентичность",
    },
  } satisfies Record<InterfaceLocale, Record<string, string>>;
  const copy = labels[locale];

  if (value === "confirmed") return copy.confirmed;
  if (value === "seeded") return copy.seeded;
  return copy.fallback;
}
