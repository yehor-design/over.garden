import type { InterfaceLocale } from "@/lib/interface-localization";
import { TRUST_CLIENT } from "@/lib/trust-client-copy";

export { formatPublicCount, type PublicCountKind } from "@/lib/public-count";

interface PublicSurfaceCopy {
  accessibility: {
    languageSwitcher: string;
  };
  analyticsConsent: {
    label: string;
    /** The question, where Google Analytics is the only tool that runs. */
    message: string;
    /** The same question where Microsoft Clarity runs too. */
    messageWithClarity: string;
    /** Where the tools, the paths and the retention are explained. */
    details: string;
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
    /** Names the bar the controls sit in, so it is a group and not a row. */
    barLabel: string;
    like: string;
    /** The button's own label once this reader has liked, not a status sentence. */
    likeActive: string;
    bookmark: string;
    bookmarkActive: string;
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
    showMoreComments: string;
    signInComplete: string;
    moreActions: string;
    /** `OVE-454`: every comment is a place a reader can link to. */
    commentPermalink: string;
    /** `OVE-493`: the action row's way to the comments. */
    commentsJump: string;
    /** "Відповідь для {author}": whom a reply answers. */
    replyTo: string;
    /** On a comment's button while it is on its way. */
    sending: string;
    /** In place of a comment its author deleted. */
    commentRemovedByAuthor: string;
    /** In place of a comment a moderator is looking at. */
    commentUnderReview: string;
    share: string;
    shareCopied: string;
    shareFailed: string;
    /** Names the field that shows the address when copying failed. */
    shareAddress: string;
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
    /** "«{subject}» походить від «{source}»" — the edge, as a sentence. */
    lineageSentence: string;
    /** What "confirmed" means here: the two gardeners, not a laboratory. */
    lineageConfirmedBy: string;
    thisObject: string;
    lineageUpdatesFrom: string;
    /** Only the object's own gardener sees these (`OVE-495`, criterion 3). */
    ownerBar: string;
    ownerWrite: string;
    ownerOpen: string;
    lineageQuestionSafety: string;
    lineageQuestionRateLimited: string;
    interactionUnavailable: string;
    followUpdates: string;
    followRequiresWriteAccess: string;
    askWithinLineage: string;
    lineageQuestionPlaceholder: string;
    sendQuestion: string;
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
  notFound: {
    title: string;
    home: string;
  };
  organism: {
    notFound: string;
    notFoundDescription: string;
    /** An organism's 404 leads to the catalogue, which is what it is part of. */
    browseCatalogue: string;
  };
}

const COPY = {
  uk: {
    accessibility: { languageSwitcher: "Змінити мову" },
    analyticsConsent: TRUST_CLIENT.uk.analyticsConsent,
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
      barLabel: "Дії із записом",
      like: "Подобається",
      likeActive: "Вподобано",
      bookmark: "Зберегти",
      bookmarkActive: "Збережено",
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
      showMoreComments: "Показати більше коментарів",
      signInComplete: "Вхід завершено. Підтвердьте дію нижче, щоб продовжити.",
      moreActions: "Інші дії",
      commentPermalink: "Посилання на коментар",
      commentsJump: "Коментувати",
      replyTo: "Відповідь для {author}",
      sending: "Надсилаємо…",
      commentRemovedByAuthor: "Автор видалив цей коментар.",
      commentUnderReview: "Коментар на перевірці модератора.",
      share: "Поділитися",
      shareCopied: "Посилання скопійовано.",
      shareFailed: "Не вдалося скопіювати. Ось посилання:",
      shareAddress: "Посилання на запис",
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
        "Звідки походить цей об'єкт — лише ті зв'язки, які підтвердили обидва садівники і за якими є публічні записи.",
      noConfirmedPublicLineage:
        "Для цього об'єкта ще немає підтвердженого публічного походження.",
      source: "Джерело",
      grownObject: "Вирощений об'єкт",
      depth: "Покоління",
      lineageSentence: "«{subject}» походить від «{source}»",
      lineageConfirmedBy:
        "Це підтвердили обидва садівники. Це їхнє слово, а не генетичний аналіз.",
      thisObject: "(цей об'єкт)",
      lineageUpdatesFrom: "Оновлення походження від",
      ownerBar: "Це ваш об'єкт.",
      ownerWrite: "Новий запис про нього",
      ownerOpen: "Відкрити в моєму саду",
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
    notFound: {
      title: "Сторінку не знайдено",
      home: "До OverGarden",
    },
    organism: {
      notFound: "Організм не знайдено",
      notFoundDescription:
        "За цією адресою немає виду, сорту чи породи. Адреси змінюються лише з постійним перенаправленням, тому посилання, ймовірно, було введено з помилкою.",
      browseCatalogue: "Відкрити каталог",
    },
  },
  bg: {
    accessibility: { languageSwitcher: "Смяна на езика" },
    analyticsConsent: TRUST_CLIENT.bg.analyticsConsent,
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
      barLabel: "Действия със записа",
      like: "Харесвам",
      likeActive: "Харесано",
      bookmark: "Запази",
      bookmarkActive: "Запазено",
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
      showMoreComments: "Покажи още коментари",
      signInComplete:
        "Влизането е завършено. Потвърдете действието по-долу, за да продължите.",
      moreActions: "Още действия",
      commentPermalink: "Връзка към коментара",
      commentsJump: "Коментирай",
      replyTo: "Отговор на {author}",
      sending: "Изпращаме…",
      commentRemovedByAuthor: "Авторът изтри този коментар.",
      commentUnderReview: "Коментарът се преглежда от модератор.",
      share: "Сподели",
      shareCopied: "Връзката е копирана.",
      shareFailed: "Копирането не успя. Ето връзката:",
      shareAddress: "Връзка към записа",
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
        "Откъде произхожда този обект — само връзките, потвърдени от двамата градинари и подкрепени от публични записи.",
      noConfirmedPublicLineage:
        "За този обект все още няма потвърден публичен произход.",
      source: "Източник",
      grownObject: "Отглеждан обект",
      depth: "Поколение",
      lineageSentence: "„{subject}“ произхожда от „{source}“",
      lineageConfirmedBy:
        "Двамата градинари го потвърдиха. Това е тяхната дума, а не генетичен анализ.",
      thisObject: "(този обект)",
      lineageUpdatesFrom: "Обновявания на произхода от",
      ownerBar: "Това е ваш обект.",
      ownerWrite: "Нов запис за него",
      ownerOpen: "Отваряне в моята градина",
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
    notFound: {
      title: "Страницата не е намерена",
      home: "Към OverGarden",
    },
    organism: {
      notFound: "Организмът не е намерен",
      notFoundDescription:
        "На този адрес няма вид, сорт или порода. Адресите се променят само с постоянно пренасочване, така че връзката вероятно е въведена грешно.",
      browseCatalogue: "Към каталога",
    },
  },
  ru: {
    accessibility: { languageSwitcher: "Сменить язык" },
    analyticsConsent: TRUST_CLIENT.ru.analyticsConsent,
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
      barLabel: "Действия с записью",
      like: "Нравится",
      likeActive: "Понравилось",
      bookmark: "Сохранить",
      bookmarkActive: "Сохранено",
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
      showMoreComments: "Показать больше комментариев",
      signInComplete:
        "Вход завершён. Подтвердите действие ниже, чтобы продолжить.",
      moreActions: "Другие действия",
      commentPermalink: "Ссылка на комментарий",
      commentsJump: "Комментировать",
      replyTo: "Ответ для {author}",
      sending: "Отправляем…",
      commentRemovedByAuthor: "Автор удалил этот комментарий.",
      commentUnderReview: "Комментарий на проверке у модератора.",
      share: "Поделиться",
      shareCopied: "Ссылка скопирована.",
      shareFailed: "Не удалось скопировать. Вот ссылка:",
      shareAddress: "Ссылка на запись",
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
        "Откуда происходит этот объект — только связи, которые подтвердили оба садовода и за которыми есть публичные записи.",
      noConfirmedPublicLineage:
        "Для этого объекта пока нет подтвержденного публичного происхождения.",
      source: "Источник",
      grownObject: "Выращенный объект",
      depth: "Поколение",
      lineageSentence: "«{subject}» происходит от «{source}»",
      lineageConfirmedBy:
        "Это подтвердили оба садовода. Это их слово, а не генетический анализ.",
      thisObject: "(этот объект)",
      lineageUpdatesFrom: "Обновления происхождения от",
      ownerBar: "Это ваш объект.",
      ownerWrite: "Новая запись о нём",
      ownerOpen: "Открыть в моём саду",
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
    notFound: {
      title: "Страница не найдена",
      home: "К OverGarden",
    },
    organism: {
      notFound: "Организм не найден",
      notFoundDescription:
        "По этому адресу нет вида, сорта или породы. Адреса меняются только с постоянным перенаправлением, поэтому ссылка, вероятно, введена с ошибкой.",
      browseCatalogue: "Открыть каталог",
    },
  },
} satisfies Record<InterfaceLocale, PublicSurfaceCopy>;

export function getPublicSurfaceCopy(locale: InterfaceLocale) {
  return COPY[locale];
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

export function publicVarietyStateLabel(
  locale: InterfaceLocale,
  value: string | null | undefined,
) {
  const labels = {
    uk: {
      selected: "Зіставлено з каталогом",
      freeText: "Збережено без збігу в каталозі",
      unknown: "Збігу в каталозі ще немає",
      fallback: "Збіг у каталозі не задано",
    },
    bg: {
      selected: "Съвпада с каталога",
      freeText: "Запазено без съвпадение в каталога",
      unknown: "Все още няма съвпадение в каталога",
      fallback: "Няма зададено съвпадение в каталога",
    },
    ru: {
      selected: "Сопоставлено с каталогом",
      freeText: "Сохранено без совпадения в каталоге",
      unknown: "Совпадения в каталоге пока нет",
      fallback: "Совпадение в каталоге не задано",
    },
  } satisfies Record<InterfaceLocale, Record<string, string>>;
  const copy = labels[locale];

  if (value === "selected") return copy.selected;
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
