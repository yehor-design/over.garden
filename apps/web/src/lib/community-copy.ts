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
  /** `OVE-454`. The community family's own words; see `public-community.tsx`. */
  breadcrumbHome: string;
  filtersLabel: string;
  clearFilters: string;
  firstRunTitle: string;
  firstRunDescription: string;
  firstRunAction: string;
  noResultsTitle: string;
  contributors: string;
  contributorsDescription: string;
  contributorEntries: (count: number) => string;
  discoverCommunities: string;
  newCommunity: string;
  discussionTitle: string;
  discussionEntry: string;
  discussionBack: string;
  replyingTo: string;
  commentPermalink: string;
  /**
   * `OVE-500`. What a community is for and how a reader takes part in it,
   * said on the card, the header and the one step that adds an entry.
   */
  topicLabel: string;
  participationSummary: string;
  cardOpen: string;
  addEntry: string;
  contributeGuest: string;
  contributeSignIn: string;
  contributeJoinFirst: string;
  writeForCommunity: string;
  freshEntry: (title: string) => string;
  aboutCommunity: string;
  discussionUnavailableTitle: string;
  discussionUnavailableBody: string;
  discussionMetaTitle: (title: string) => string;
  ownEntry: string;
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
    eyebrow: "Спільнота",
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
    contributeTitle: "Додати запис до спільноти",
    contributeDescription:
      "Сюди додають записи, які ви вже опублікували про свою рослину чи тварину. Запис лишається у вашому журналі за тією самою адресою, а в спільноті з’являються посилання на нього й обговорення.",
    chooseJournal: "Ваш опублікований запис",
    contribute: "Додати до спільноти",
    noEligibleJournals:
      "У вас ще немає опублікованих записів про рослину чи тварину, яких тут немає.",
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
    moderatorQueue: "Модерація цієї спільноти",
    showMore: "Переглянути більше",
    archived: "Цю спільноту архівовано. Записи доступні лише для читання.",
    loading: "Завантажуємо спільноту",
    error: "Спільнота тимчасово недоступна.",
    retry: "Спробувати ще раз",
    actionMessages: {
      joined: "Ви приєдналися до спільноти. Тепер можна додавати свої записи.",
      left: "Ви вийшли зі спільноти.",
      contributed: "Запис додано до спільноти.",
      reported: "Скаргу передано модератору.",
      blocked: "Автор заблокований; його записи більше не відображаються.",
      not_member:
        "Спершу приєднайтеся до спільноти: додавати записи можуть лише учасники.",
      banned:
        "Модератор обмежив вашу участь у цій спільноті, тож додати запис не вийде.",
      closed: "Спільнота зараз не приймає нових записів.",
      not_eligible:
        "Цей запис не можна додати: сюди додаються лише ваші опубліковані записи про одну рослину чи тварину.",
      already_added: "Цей запис уже є в спільноті.",
      removed:
        "Модератор прибрав цей запис зі спільноти, тож додати його знову не вийде.",
      community_unavailable: "Такої спільноти немає або вона вже не діє.",
      unavailable: "Дію не виконано. Оновіть сторінку й спробуйте ще раз.",
    },
    breadcrumbHome: "Спільноти",
    filtersLabel: "Фільтри",
    clearFilters: "Скинути фільтри",
    firstRunTitle: "Тут ще немає записів",
    firstRunDescription:
      "Спільнота відкрита. Додайте перший запис про свою рослину чи тварину — його побачать усі, хто сюди зайде.",
    firstRunAction: "Додати перший запис",
    noResultsTitle: "За цими умовами записів не знайдено",
    contributors: "Хто пише тут",
    contributorsDescription:
      "Садівники, чиї публічні записи вже є в цій спільноті.",
    contributorEntries: (count: number) =>
      `${count} ${count % 10 === 1 && count % 100 !== 11 ? "запис" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "записи" : "записів"}`,
    discoverCommunities: "Інші спільноти",
    newCommunity: "Нова спільнота",
    discussionTitle: "Обговорення запису",
    discussionEntry: "Запис, який обговорюють",
    discussionBack: "До спільноти",
    replyingTo: "У відповідь",
    commentPermalink: "Посилання на коментар",
    topicLabel: "Тема",
    participationSummary:
      "Учасники додають сюди свої опубліковані записи про рослини й тварин і обговорюють їх. Приєднатися може кожен, хто має обліковий запис.",
    cardOpen: "Відкрита для нових записів",
    addEntry: "Додати запис",
    contributeGuest:
      "Увійдіть і приєднайтеся до спільноти, щоб додати свій запис.",
    contributeSignIn: "Увійти, щоб додати запис",
    contributeJoinFirst:
      "Додавати записи можуть учасники. Приєднатися можна одним натисканням, а вийти — будь-коли.",
    writeForCommunity: "Написати запис для спільноти",
    freshEntry: (title: string) =>
      `Запис «${title}» опубліковано. Додайте його до спільноти, щоб він з’явився тут.`,
    aboutCommunity: "Ця спільнота",
    discussionUnavailableTitle: "Це обговорення недоступне",
    discussionUnavailableBody:
      "Запис прибрали зі спільноти, або автор більше не показує його публічно.",
    discussionMetaTitle: (title: string) => `Обговорення: ${title}`,
    ownEntry: "Ваш запис",
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
    eyebrow: "Общност",
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
    contributeTitle: "Добавяне на запис в общността",
    contributeDescription:
      "Тук се добавят записи, които вече сте публикували за свое растение или животно. Записът остава в дневника ви на същия адрес, а в общността се появяват връзка към него и обсъждане.",
    chooseJournal: "Ваш публикуван запис",
    contribute: "Добавяне към общността",
    noEligibleJournals:
      "Все още нямате публикувани записи за растение или животно, които да ги няма тук.",
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
    moderatorQueue: "Модериране на тази общност",
    showMore: "Показване на още",
    archived: "Тази общност е архивирана и е достъпна само за четене.",
    loading: "Зареждане на общността",
    error: "Общността временно не е достъпна.",
    retry: "Нов опит",
    actionMessages: {
      joined:
        "Присъединихте се към общността. Вече можете да добавяте свои записи.",
      left: "Напуснахте общността.",
      contributed: "Записът е добавен към общността.",
      reported: "Сигналът е изпратен до модератор.",
      blocked: "Авторът е блокиран и записите му вече не се показват.",
      not_member:
        "Първо се присъединете към общността: записи могат да добавят само членовете.",
      banned:
        "Модератор е ограничил участието ви в тази общност, затова не можете да добавите запис.",
      closed: "Общността в момента не приема нови записи.",
      not_eligible:
        "Този запис не може да бъде добавен: тук се добавят само ваши публикувани записи за едно растение или животно.",
      already_added: "Този запис вече е в общността.",
      removed:
        "Модератор е премахнал този запис от общността, затова не може да бъде добавен отново.",
      community_unavailable: "Такава общност няма или вече не е активна.",
      unavailable: "Действието не бе изпълнено. Обновете и опитайте отново.",
    },
    breadcrumbHome: "Общности",
    filtersLabel: "Филтри",
    clearFilters: "Изчистване на филтрите",
    firstRunTitle: "Тук още няма записи",
    firstRunDescription:
      "Общността е отворена. Добавете първия запис за свое растение или животно — ще го видят всички, които влязат тук.",
    firstRunAction: "Добавете първия запис",
    noResultsTitle: "При тези условия не са намерени записи",
    contributors: "Кой пише тук",
    contributorsDescription:
      "Градинари, чиито публични записи вече са в тази общност.",
    contributorEntries: (count: number) =>
      `${count} ${count === 1 ? "запис" : "записа"}`,
    discoverCommunities: "Други общности",
    newCommunity: "Нова общност",
    discussionTitle: "Обсъждане на записа",
    discussionEntry: "Записът, който се обсъжда",
    discussionBack: "Към общността",
    replyingTo: "В отговор на",
    commentPermalink: "Връзка към коментара",
    topicLabel: "Тема",
    participationSummary:
      "Членовете добавят тук своите публикувани записи за растения и животни и ги обсъждат. Всеки с профил може да се присъедини.",
    cardOpen: "Отворена за нови записи",
    addEntry: "Добавяне на запис",
    contributeGuest:
      "Влезте и се присъединете към общността, за да добавите свой запис.",
    contributeSignIn: "Вход за добавяне на запис",
    contributeJoinFirst:
      "Записи могат да добавят членовете. Присъединявате се с едно натискане и можете да напуснете по всяко време.",
    writeForCommunity: "Напишете запис за общността",
    freshEntry: (title: string) =>
      `Записът „${title}“ е публикуван. Добавете го в общността, за да се появи тук.`,
    aboutCommunity: "Тази общност",
    discussionUnavailableTitle: "Това обсъждане не е достъпно",
    discussionUnavailableBody:
      "Записът е премахнат от общността или авторът вече не го показва публично.",
    discussionMetaTitle: (title: string) => `Обсъждане: ${title}`,
    ownEntry: "Ваш запис",
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
    eyebrow: "Сообщество",
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
    contributeTitle: "Добавить запись в сообщество",
    contributeDescription:
      "Сюда добавляют записи, которые вы уже опубликовали о своём растении или животном. Запись остаётся в вашем журнале по тому же адресу, а в сообществе появляются ссылка на неё и обсуждение.",
    chooseJournal: "Ваша опубликованная запись",
    contribute: "Добавить в сообщество",
    noEligibleJournals:
      "У вас пока нет опубликованных записей о растении или животном, которых здесь нет.",
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
    moderatorQueue: "Модерация этого сообщества",
    showMore: "Показать ещё",
    archived: "Это сообщество архивировано и доступно только для чтения.",
    loading: "Загружаем сообщество",
    error: "Сообщество временно недоступно.",
    retry: "Попробовать снова",
    actionMessages: {
      joined:
        "Вы присоединились к сообществу. Теперь можно добавлять свои записи.",
      left: "Вы покинули сообщество.",
      contributed: "Запись добавлена в сообщество.",
      reported: "Жалоба передана модератору.",
      blocked: "Автор заблокирован, его записи больше не отображаются.",
      not_member:
        "Сначала присоединитесь к сообществу: добавлять записи могут только участники.",
      banned:
        "Модератор ограничил ваше участие в этом сообществе, поэтому добавить запись не получится.",
      closed: "Сообщество сейчас не принимает новые записи.",
      not_eligible:
        "Эту запись нельзя добавить: сюда добавляются только ваши опубликованные записи об одном растении или животном.",
      already_added: "Эта запись уже есть в сообществе.",
      removed:
        "Модератор убрал эту запись из сообщества, поэтому добавить её снова не получится.",
      community_unavailable: "Такого сообщества нет, или оно уже не действует.",
      unavailable:
        "Действие не выполнено. Обновите страницу и попробуйте снова.",
    },
    breadcrumbHome: "Сообщества",
    filtersLabel: "Фильтры",
    clearFilters: "Сбросить фильтры",
    firstRunTitle: "Здесь пока нет записей",
    firstRunDescription:
      "Сообщество открыто. Добавьте первую запись о своём растении или животном — её увидят все, кто сюда заглянет.",
    firstRunAction: "Добавить первую запись",
    noResultsTitle: "По этим условиям записей не найдено",
    contributors: "Кто пишет здесь",
    contributorsDescription:
      "Садоводы, чьи публичные записи уже есть в этом сообществе.",
    contributorEntries: (count: number) =>
      `${count} ${count % 10 === 1 && count % 100 !== 11 ? "запись" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "записи" : "записей"}`,
    discoverCommunities: "Другие сообщества",
    newCommunity: "Новое сообщество",
    discussionTitle: "Обсуждение записи",
    discussionEntry: "Запись, которую обсуждают",
    discussionBack: "К сообществу",
    replyingTo: "В ответ",
    commentPermalink: "Ссылка на комментарий",
    topicLabel: "Тема",
    participationSummary:
      "Участники добавляют сюда свои опубликованные записи о растениях и животных и обсуждают их. Присоединиться может любой, у кого есть учётная запись.",
    cardOpen: "Открыто для новых записей",
    addEntry: "Добавить запись",
    contributeGuest:
      "Войдите и присоединитесь к сообществу, чтобы добавить свою запись.",
    contributeSignIn: "Войти, чтобы добавить запись",
    contributeJoinFirst:
      "Добавлять записи могут участники. Присоединиться можно одним нажатием, а выйти — в любой момент.",
    writeForCommunity: "Написать запись для сообщества",
    freshEntry: (title: string) =>
      `Запись «${title}» опубликована. Добавьте её в сообщество, чтобы она появилась здесь.`,
    aboutCommunity: "Это сообщество",
    discussionUnavailableTitle: "Это обсуждение недоступно",
    discussionUnavailableBody:
      "Запись убрали из сообщества, или автор больше не показывает её публично.",
    discussionMetaTitle: (title: string) => `Обсуждение: ${title}`,
    ownEntry: "Ваша запись",
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
