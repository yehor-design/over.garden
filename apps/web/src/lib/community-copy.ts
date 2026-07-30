import type { PublicLocale } from "./public-localization";

export interface CommunityCopy {
  navigation: string;
  directoryTitle: string;
  directoryDescription: string;
  directoryEmpty: string;
  openCommunity: string;
  name: string;
  description: string;
  eyebrow: string;
  journals: string;
  members: string;
  objects: string;
  rules: string;
  rulesDescription: string;
  ruleLabels: Record<string, string>;
  relatedKnowledge: string;
  openKnowledge: string;
  follow: string;
  leave: string;
  banned: string;
  participationClosed: string;
  contributeTitle: string;
  contributeDescription: string;
  chooseJournal: string;
  contribute: string;
  noEligibleJournals: string;
  createJournal: string;
  searchLabel: string;
  searchPlaceholder: string;
  search: string;
  shortSearch: string;
  degradedSearch: string;
  kindLabel: string;
  allKinds: string;
  kindLabels: Record<"plant" | "animal", string>;
  noContributions: string;
  noResults: string;
  resetFilters: string;
  readJournal: string;
  comments: string;
  discussionClosed: string;
  backToCommunity: string;
  report: string;
  block: string;
  reportReason: string;
  reportReasons: Record<string, string>;
  sendReport: string;
  reportPending: string;
  moderatorQueue: string;
  showMore: string;
  archived: string;
  loading: string;
  error: string;
  retry: string;
  actionMessages: Record<string, string>;
}

const COPY: Record<PublicLocale, CommunityCopy> = {
  uk: {
    navigation: "Спільноти",
    directoryTitle: "Спільноти",
    directoryDescription:
      "Тематичні групи з реальними спостереженнями, журналами догляду та зрозумілими правилами участі.",
    directoryEmpty: "Зараз немає доступних спільнот.",
    openCommunity: "Відкрити спільноту",
    name: "Спостереження і догляд",
    description:
      "Практичні записи про зміни стану рослин, тварин і бджолиних сімей, перевірені власним досвідом.",
    eyebrow: "Тематична спільнота",
    journals: "Записи",
    members: "Учасники",
    objects: "Живі об’єкти",
    rules: "Правила спільноти",
    rulesDescription:
      "Короткі правила, що зберігають записи корисними й безпечними.",
    ruleLabels: {
      "share-observed-evidence":
        "Публікуйте власні спостереження та вказуйте, що саме перевірили.",
      "protect-people-and-places":
        "Не розкривайте точні адреси, координати чи приватні дані.",
      "disagree-with-care":
        "Критикуйте метод, а не людину; пояснюйте альтернативу.",
    },
    relatedKnowledge: "Пов’язані знання",
    openKnowledge: "Переглянути добірку знань",
    follow: "Приєднатися",
    leave: "Вийти зі спільноти",
    banned: "Участь у цій спільноті для вас обмежена модератором.",
    participationClosed: "Нові внески тимчасово закриті модератором.",
    contributeTitle: "Додати свій запис",
    contributeDescription:
      "Оберіть уже опублікований журнал. Його текст залишається в канонічному записі.",
    chooseJournal: "Опублікований журнал",
    contribute: "Додати до спільноти",
    noEligibleJournals:
      "У вас немає нових публічних записів, які можна додати.",
    createJournal: "Створити запис",
    searchLabel: "Пошук у спільноті",
    searchPlaceholder: "Тема, об’єкт або спостереження",
    search: "Знайти",
    shortSearch: "Введіть щонайменше 2 символи, щоб шукати в спільноті.",
    degradedSearch:
      "Пошук тимчасово обмежений найновішими записами цієї спільноти. Можна надіслати запит ще раз.",
    kindLabel: "Тип об’єкта",
    allKinds: "Усі",
    kindLabels: {
      plant: "Рослини",
      animal: "Тварини",
    },
    noContributions: "Поки немає опублікованих спостережень.",
    noResults: "За цими умовами записів не знайдено.",
    resetFilters: "Скинути фільтри",
    readJournal: "Читати запис",
    comments: "Обговорення",
    discussionClosed: "Обговорення закрито модератором",
    backToCommunity: "Повернутися до спільноти",
    report: "Поскаржитися",
    block: "Заблокувати автора",
    reportReason: "Причина",
    reportReasons: {
      spam: "Спам",
      harassment: "Переслідування",
      privacy: "Приватні дані",
      misinformation: "Небезпечна або хибна порада",
      off_topic: "Не за темою",
      other: "Інше",
    },
    sendReport: "Надіслати скаргу",
    reportPending: "Скарга очікує розгляду модератором",
    moderatorQueue: "Черга модерації",
    showMore: "Переглянути більше",
    archived: "Цю спільноту архівовано. Записи доступні лише для читання.",
    loading: "Завантажуємо спільноту",
    error: "Спільнота тимчасово недоступна.",
    retry: "Спробувати ще раз",
    actionMessages: {
      joined: "Ви приєдналися до спільноти.",
      left: "Ви вийшли зі спільноти.",
      contributed: "Запис додано до спільноти.",
      reported: "Скаргу передано модератору.",
      blocked: "Автор заблокований; його записи більше не відображаються.",
      unavailable: "Дію не виконано. Оновіть сторінку й спробуйте ще раз.",
    },
  },
  bg: {
    navigation: "Общности",
    directoryTitle: "Общности",
    directoryDescription:
      "Тематични групи с реални наблюдения, дневници за грижи и ясни правила за участие.",
    directoryEmpty: "В момента няма достъпни общности.",
    openCommunity: "Отваряне на общността",
    name: "Наблюдения и грижи",
    description:
      "Практични записи за промени при растения, животни и пчелни семейства, проверени чрез личен опит.",
    eyebrow: "Тематична общност",
    journals: "Записи",
    members: "Участници",
    objects: "Живи обекти",
    rules: "Правила на общността",
    rulesDescription: "Кратки правила за полезни и безопасни записи.",
    ruleLabels: {
      "share-observed-evidence":
        "Споделяйте собствени наблюдения и посочвайте какво сте проверили.",
      "protect-people-and-places":
        "Не разкривайте точни адреси, координати или лични данни.",
      "disagree-with-care":
        "Критикувайте метода, не човека, и обяснете алтернативата.",
    },
    relatedKnowledge: "Свързани знания",
    openKnowledge: "Преглед на подбраните знания",
    follow: "Присъединяване",
    leave: "Напускане на общността",
    banned: "Участието ви в тази общност е ограничено от модератор.",
    participationClosed: "Новите приноси са временно затворени от модератор.",
    contributeTitle: "Добавяне на ваш запис",
    contributeDescription:
      "Изберете вече публикуван дневник. Текстът остава в каноничния запис.",
    chooseJournal: "Публикуван дневник",
    contribute: "Добавяне към общността",
    noEligibleJournals: "Нямате нови публични записи за добавяне.",
    createJournal: "Създаване на запис",
    searchLabel: "Търсене в общността",
    searchPlaceholder: "Тема, обект или наблюдение",
    search: "Търсене",
    shortSearch: "Въведете поне 2 знака, за да търсите в общността.",
    degradedSearch:
      "Търсенето временно е ограничено до най-новите записи в тази общност. Можете да изпратите заявката отново.",
    kindLabel: "Тип обект",
    allKinds: "Всички",
    kindLabels: {
      plant: "Растения",
      animal: "Животни",
    },
    noContributions: "Все още няма публикувани наблюдения.",
    noResults: "Няма записи за избраните условия.",
    resetFilters: "Изчистване на филтрите",
    readJournal: "Прочитане на записа",
    comments: "Обсъждане",
    discussionClosed: "Обсъждането е затворено от модератор",
    backToCommunity: "Назад към общността",
    report: "Докладване",
    block: "Блокиране на автора",
    reportReason: "Причина",
    reportReasons: {
      spam: "Спам",
      harassment: "Тормоз",
      privacy: "Лични данни",
      misinformation: "Опасен или неверен съвет",
      off_topic: "Извън темата",
      other: "Друго",
    },
    sendReport: "Изпращане на сигнала",
    reportPending: "Сигналът очаква преглед от модератор",
    moderatorQueue: "Модераторска опашка",
    showMore: "Показване на още",
    archived: "Тази общност е архивирана и е достъпна само за четене.",
    loading: "Зареждане на общността",
    error: "Общността временно не е достъпна.",
    retry: "Нов опит",
    actionMessages: {
      joined: "Присъединихте се към общността.",
      left: "Напуснахте общността.",
      contributed: "Записът е добавен към общността.",
      reported: "Сигналът е изпратен до модератор.",
      blocked: "Авторът е блокиран и записите му вече не се показват.",
      unavailable: "Действието не бе изпълнено. Обновете и опитайте отново.",
    },
  },
  ru: {
    navigation: "Сообщества",
    directoryTitle: "Сообщества",
    directoryDescription:
      "Тематические группы с реальными наблюдениями, журналами ухода и понятными правилами участия.",
    directoryEmpty: "Сейчас нет доступных сообществ.",
    openCommunity: "Открыть сообщество",
    name: "Наблюдения и уход",
    description:
      "Практические записи об изменениях у растений, животных и пчелиных семей, проверенные личным опытом.",
    eyebrow: "Тематическое сообщество",
    journals: "Записи",
    members: "Участники",
    objects: "Живые объекты",
    rules: "Правила сообщества",
    rulesDescription: "Краткие правила для полезных и безопасных записей.",
    ruleLabels: {
      "share-observed-evidence":
        "Публикуйте собственные наблюдения и уточняйте, что именно проверили.",
      "protect-people-and-places":
        "Не раскрывайте точные адреса, координаты или личные данные.",
      "disagree-with-care":
        "Критикуйте метод, а не человека, и объясняйте альтернативу.",
    },
    relatedKnowledge: "Связанные знания",
    openKnowledge: "Открыть подборку знаний",
    follow: "Присоединиться",
    leave: "Покинуть сообщество",
    banned: "Ваше участие в этом сообществе ограничено модератором.",
    participationClosed: "Новые публикации временно закрыты модератором.",
    contributeTitle: "Добавить свою запись",
    contributeDescription:
      "Выберите уже опубликованный журнал. Его текст останется в исходной записи.",
    chooseJournal: "Опубликованный журнал",
    contribute: "Добавить в сообщество",
    noEligibleJournals: "У вас нет новых публичных записей для добавления.",
    createJournal: "Создать запись",
    searchLabel: "Поиск в сообществе",
    searchPlaceholder: "Тема, объект или наблюдение",
    search: "Найти",
    shortSearch: "Введите не менее 2 символов для поиска в сообществе.",
    degradedSearch:
      "Поиск временно ограничен новейшими записями этого сообщества. Запрос можно отправить ещё раз.",
    kindLabel: "Тип объекта",
    allKinds: "Все",
    kindLabels: {
      plant: "Растения",
      animal: "Животные",
    },
    noContributions: "Опубликованных наблюдений пока нет.",
    noResults: "По выбранным условиям записей не найдено.",
    resetFilters: "Сбросить фильтры",
    readJournal: "Читать запись",
    comments: "Обсуждение",
    discussionClosed: "Обсуждение закрыто модератором",
    backToCommunity: "Вернуться к сообществу",
    report: "Пожаловаться",
    block: "Заблокировать автора",
    reportReason: "Причина",
    reportReasons: {
      spam: "Спам",
      harassment: "Преследование",
      privacy: "Личные данные",
      misinformation: "Опасный или неверный совет",
      off_topic: "Не по теме",
      other: "Другое",
    },
    sendReport: "Отправить жалобу",
    reportPending: "Жалоба ожидает проверки модератором",
    moderatorQueue: "Очередь модерации",
    showMore: "Показать ещё",
    archived: "Это сообщество архивировано и доступно только для чтения.",
    loading: "Загружаем сообщество",
    error: "Сообщество временно недоступно.",
    retry: "Попробовать снова",
    actionMessages: {
      joined: "Вы присоединились к сообществу.",
      left: "Вы покинули сообщество.",
      contributed: "Запись добавлена в сообщество.",
      reported: "Жалоба передана модератору.",
      blocked: "Автор заблокирован, его записи больше не отображаются.",
      unavailable:
        "Действие не выполнено. Обновите страницу и попробуйте снова.",
    },
  },
};

export function getCommunityCopy(locale: PublicLocale) {
  return COPY[locale];
}

const CONTENT_COPY: Record<
  PublicLocale,
  Record<string, { name: string; description: string }>
> = {
  uk: {
    "observation-and-care": {
      name: "Спостереження і догляд",
      description:
        "Практичні записи про зміни стану рослин, тварин і бджолиних сімей, перевірені власним досвідом.",
    },
    "visual-new-community": {
      name: "Нова спільнота без записів",
      description:
        "Місце для перших перевірених спостережень. Публікацію нових внесків тимчасово закрито.",
    },
    "visual-care-across-every-living-object": {
      name: "Догляд за рослинами, тваринами та бджолиними сім’ями впродовж усього року",
      description:
        "Докладні сезонні спостереження, порівняння методів і практичні результати для різних живих об’єктів у домашньому господарстві.",
    },
  },
  bg: {
    "observation-and-care": {
      name: "Наблюдения и грижи",
      description:
        "Практични записи за промени при растения, животни и пчелни семейства, проверени чрез личен опит.",
    },
    "visual-new-community": {
      name: "Нова общност без записи",
      description:
        "Място за първите проверени наблюдения. Новите приноси са временно затворени.",
    },
    "visual-care-across-every-living-object": {
      name: "Грижи за растения, животни и пчелни семейства през цялата година",
      description:
        "Подробни сезонни наблюдения, сравнения на методи и практически резултати за различни живи обекти в домакинството.",
    },
  },
  ru: {
    "observation-and-care": {
      name: "Наблюдения и уход",
      description:
        "Практические записи об изменениях у растений, животных и пчелиных семей, проверенные личным опытом.",
    },
    "visual-new-community": {
      name: "Новое сообщество без записей",
      description:
        "Место для первых проверенных наблюдений. Новые публикации временно закрыты.",
    },
    "visual-care-across-every-living-object": {
      name: "Уход за растениями, животными и пчелиными семьями в течение всего года",
      description:
        "Подробные сезонные наблюдения, сравнение методов и практические результаты для разных живых объектов в домашнем хозяйстве.",
    },
  },
};

export function getCommunityContentCopy(
  locale: PublicLocale,
  contentKey: string,
) {
  return (
    CONTENT_COPY[locale][contentKey] ?? {
      name: COPY[locale].name,
      description: COPY[locale].description,
    }
  );
}
