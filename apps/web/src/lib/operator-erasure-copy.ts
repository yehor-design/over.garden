import type { InterfaceLocale } from "@/lib/interface-localization";
import type { WidenCopy } from "@/lib/operator-copy";

const UK_COPY = {
  metadataTitle: "Запити на видалення | OverGarden",
  title: "Запити на видалення",
  description:
    "Садівники просять стерти свій акаунт. Кожен запит проходить кроки: розгляд, попередній звіт про те, що буде стерто, і тоді — стирання або інший результат. Нічого не стирається без вашого окремого підтвердження.",
  empty: "Запитів на видалення ще не надіслано.",
  requestReference: "Номер запиту",
  requesterUserId: "ID акаунта (для діагностики)",
  scope: "Обсяг",
  intakeVersion: "Версія форми",
  dryRunReviewed: "Звіт переглянуто",
  handledStatus: "Результат",
  startReview: "Почати розгляд",
  executionRequiresOwner: "Стерти дані може лише власник або адміністратор.",
  executionTitle: "Стерти дані акаунта",
  executionDescription:
    "Стирає або знеособлює все, що належить акаунту: вхід, профіль, сад, записи, фото, аналітику й службові записи. Фото, ключі яких відомі, видаляються зі сховища; копії поза OverGarden — лише за можливості. Скасувати не можна.",
  approvalPhrase: "Фраза підтвердження",
  confirmTitle: "Стерти дані за запитом",
  confirmDescription:
    "Буде стерто або знеособлено: {scope}. Скасувати це неможливо. Публічні сторінки акаунта повідомлятимуть про видалення щонайбільше сім днів, а потім зникнуть.",
  confirmAction: "Так, стерти",
  confirmCancel: "Скасувати",
  execute: "Стерти дані",
  reviewBeforeExecution: "Спершу позначте попередній звіт переглянутим.",
  operatorOutcome: "Інший результат",
  markHandled: "Зафіксувати результат",
  previewTitle: "Попередній звіт: що буде стерто",
  previewDescription:
    "Лише які дані й скільки. Звіт нічого не змінює й не показує вмісту: ні текстів, ні фото, ні адрес чи контактів.",
  recordReviewAgain: "Позначити звіт переглянутим ще раз",
  markReviewed: "Позначити звіт переглянутим",
  requester: "Акаунт",
  requesterNoHandle: "без публічного ніка",
  requesterErased: "уже стерто",
  received: "Отримано",
  nextTitle: "Наступний крок",
  next: {
    startReview: "Почніть розгляд.",
    reviewPreview:
      "Перегляньте попередній звіт нижче й позначте його переглянутим.",
    decide:
      "Сотріть дані (потрібна фраза підтвердження) або зафіксуйте інший результат.",
    resumeCleanup:
      "Дані акаунта вже стерто, але очищення фото й пошуку ще не підтверджене. Продовжте очищення.",
    waitingIdentity:
      "Запит закрито. Заявник має підтвердити особу через підтримку й надіслати запит знову.",
    nothing: "Нічого робити не треба.",
  },
  technicalTitle: "Технічні дані",
  retryCleanup: "Продовжити очищення",
  retryCleanupDescription:
    "Очищення продовжиться з того місця, де зупинилося: фото зі сховища й сторінки з пошуку. Запит стане виконаним лише тоді, коли це підтвердиться.",
  scopeLine:
    "простори: {spaces}, живі об'єкти: {objects}, записи: {entries}, фото: {photos}",
  outcome: {
    savedTitle: "Збережено",
    savedBody: "{reference}: {state}.",
    staleTitle: "Нічого не змінено",
    staleBody: "{reference} уже в іншому стані: {state}.",
    approvalTitle: "Нічого не стерто",
    approvalBody:
      "Фраза підтвердження не збігається. Введіть її точно так, як показано під полем.",
  },
  accessLine: "Ваш доступ: {gate} · роль: {role}",
  count: "Запитів: {count}",
  dataClasses: {
    account_auth: {
      label: "Акаунт і пов'язані дані автентифікації",
      description:
        "Рядок користувача Better Auth, пов'язані сесії та credential/provider accounts.",
    },
    public_identity: {
      label: "Псевдонімна публічна ідентичність",
      description:
        "Поточний профіль і чинні або колишні ніки, пов’язані з акаунтом. Значення ніків, імена для показу, терміни політики та внутрішні ID не показуються.",
    },
    garden_workspace: {
      label: "Робочий простір саду",
      description:
        "Власні простори й живі об'єкти, що закріплюють історію журналу.",
    },
    lineage_provenance: {
      label: "Походження та провенанс",
      description:
        "Провенанс у межах власника та приватні взаємодії походження, що зберігають структуру через анонімізовані tombstones. Мітки джерел, текст запитань і контактні дані не показуються.",
    },
    journal_entries: {
      label: "Записи журналу",
      description:
        "Приватні й публічні рядки за життєвим циклом. Заголовки та текст не вибираються для цього перегляду.",
    },
    media_assets: {
      label: "Похідні медіа та quarantine-посилання",
      description:
        "Рядки обробки фото за статусом, включно cover-only. Ключі об'єктів і підписані URL не вибираються.",
    },
    social_engagement: {
      label: "Соціальні та engagement-рядки",
      description:
        "Підписки/блоки профілів, коментарі, закладки та сповіщення. Анонімні likes не обліковуються як прив'язка до акаунта.",
    },
    community: {
      label: "Спільнота та модераційні посилання",
      description:
        "Членства, внески та акторські посилання модерації, що потребують rekey або cascade-delete.",
    },
    public_exposure: {
      label: "Публічні slugs і tombstones",
      description:
        "Опубліковані URL та архівовані записи, що повертають 410 Gone за старим slug.",
    },
    analytics_events: {
      label: "Події аналітики",
      description:
        "Власні події активації, утримання й пульсу цінності, що належать заявнику.",
    },
    catalog_provisional: {
      label: "Тимчасові рядки каталогу",
      description:
        "Тимчасові картки каталогу, створені садівником до появи власних назв, та об'єкти з власною назвою як міткою.",
    },
    catalog_operator_links: {
      label: "Операторські посилання каталогу",
      description:
        "Soft-посилання рецензентів і авторів на suggestions, aliases і seed proofs.",
    },
    search_index_artifacts: {
      label: "Артефакти пошуку та індексу",
      description:
        "Публічні записи з похідними документами та journal jobs у будь-якому статусі черги.",
    },
    erasure_operator_records: {
      label: "Операторські записи видалення",
      description:
        "Рядки приймання запитів на видалення, пов'язані із заявником.",
    },
  },
  countLabels: {
    user_row: "рядок користувача",
    sessions: "сесії",
    accounts: "акаунти",
    publication_disclosures: "підтвердження публікації",
    profiles: "публічні профілі",
    current_handle_claims: "чинні ніки",
    retired_handle_claims: "колишні ніки",
    unreviewed_policy_rows: "неперевірені політикою рядки",
    spaces: "простори",
    plant_objects: "живі об'єкти",
    provenance_edges: "зв'язки провенансу",
    pending_identities: "очікувані ідентичності",
    audit_events: "події аудиту",
    follows: "підписки",
    questions: "запитання",
    total: "усього",
    public_active: "активні публічні",
    deletion_pending: "очікують видалення",
    object_mentions: "згадки об'єктів",
    catalog_mentions: "згадки каталогу",
    quarantined: "у quarantine",
    processed: "оброблені",
    failed: "з помилкою",
    cover_only: "лише обкладинка",
    explicit_cover_refs: "явні обкладинки",
    profile_follows: "підписки профілів",
    profile_blocks: "блоки профілів",
    comments: "коментарі",
    bookmarks: "закладки",
    notification_receipts: "сповіщення",
    memberships: "членства",
    contributions: "внески",
    moderation_actor_refs: "акторські посилання модерації",
    public_slugs: "публічні slugs",
    gone_tombstones: "410 tombstones",
    events: "події",
    provisional_catalog_items: "тимчасові елементи каталогу",
    own_name_objects: "об'єкти з власною назвою",
    reviewer_or_author_links: "посилання рецензента/автора",
    public_active_entries: "активні публічні записи",
    pending_index_jobs: "очікувані index jobs",
    pending_unindex_jobs: "очікувані unindex jobs",
    terminal_jobs_with_user_id: "термінальні jobs з user id",
    erasure_requests: "запити на видалення",
  },
  caveats: [
    "Перегляд недеструктивний і повторюваний. Перегляд не видаляє й не анонімізує дані акаунта, саду, походження, журналу, медіа, пошуку або аналітики.",
    "Кількості описують лише класи даних. Необроблений текст журналів, ключі медіа, email, токени, IP, user-agent, referrer і точне місцезнаходження не потрапляють до цієї моделі.",
    "Остаточне незворотне видалення або анонімізація все одно потребують схвалення супроводжувача й окремого операторського процесу.",
  ],
} as const;

export type OperatorErasureCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY: OperatorErasureCopy = {
  metadataTitle: "Заявки за изтриване | OverGarden",
  title: "Заявки за изтриване",
  description:
    "Градинари искат акаунтът им да бъде изтрит. Всяка заявка минава през стъпки: преглед, предварителен отчет какво ще бъде изтрито и тогава — изтриване или друг резултат. Нищо не се изтрива без вашето отделно потвърждение.",
  empty: "Все още няма изпратени заявки за изтриване.",
  requestReference: "Номер на заявката",
  requesterUserId: "ID на акаунта (за диагностика)",
  scope: "Обхват",
  intakeVersion: "Версия на формуляра",
  dryRunReviewed: "Отчетът е прегледан",
  handledStatus: "Резултат",
  startReview: "Започни преглед",
  executionRequiresOwner:
    "Само собственик или администратор може да изтрие данните.",
  executionTitle: "Изтриване на данните на акаунта",
  executionDescription:
    "Изтрива или обезличава всичко, което принадлежи на акаунта: вход, профил, градина, записи, снимки, анализи и служебни записи. Снимките с известни ключове се изтриват от хранилището; копията извън OverGarden — само при възможност. Не може да се отмени.",
  approvalPhrase: "Фраза за потвърждение",
  confirmTitle: "Изтриване на данните по заявката",
  confirmDescription:
    "Ще бъде изтрито или обезличено: {scope}. Това не може да се отмени. Публичните страници на акаунта ще съобщават за изтриването най-много седем дни, а после ще изчезнат.",
  confirmAction: "Да, изтрий",
  confirmCancel: "Отказ",
  execute: "Изтрий данните",
  reviewBeforeExecution:
    "Първо отбележете предварителния отчет като прегледан.",
  operatorOutcome: "Друг резултат",
  markHandled: "Запиши резултата",
  previewTitle: "Предварителен отчет: какво ще бъде изтрито",
  previewDescription:
    "Само какви данни и колко. Отчетът нищо не променя и не показва съдържание: нито текстове, нито снимки, нито адреси или контакти.",
  recordReviewAgain: "Отбележи отчета като прегледан отново",
  markReviewed: "Отбележи отчета като прегледан",
  requester: "Акаунт",
  requesterNoHandle: "без публичен псевдоним",
  requesterErased: "вече е изтрит",
  received: "Получена",
  nextTitle: "Следваща стъпка",
  next: {
    startReview: "Започнете прегледа.",
    reviewPreview:
      "Прегледайте предварителния отчет по-долу и го отбележете като прегледан.",
    decide:
      "Изтрийте данните (нужна е фраза за потвърждение) или запишете друг резултат.",
    resumeCleanup:
      "Данните на акаунта вече са изтрити, но почистването на снимките и търсенето още не е потвърдено. Продължете почистването.",
    waitingIdentity:
      "Заявката е затворена. Заявителят трябва да потвърди самоличността си чрез поддръжката и да изпрати заявката отново.",
    nothing: "Не е нужно нищо да се прави.",
  },
  technicalTitle: "Технически данни",
  retryCleanup: "Продължи почистването",
  retryCleanupDescription:
    "Почистването продължава оттам, докъдето е стигнало: снимките от хранилището и страниците от търсенето. Заявката става изпълнена едва когато това се потвърди.",
  scopeLine:
    "пространства: {spaces}, живи обекти: {objects}, записи: {entries}, снимки: {photos}",
  outcome: {
    savedTitle: "Запазено",
    savedBody: "{reference}: {state}.",
    staleTitle: "Нищо не е променено",
    staleBody: "{reference} вече е в друго състояние: {state}.",
    approvalTitle: "Нищо не е изтрито",
    approvalBody:
      "Фразата за потвърждение не съвпада. Въведете я точно както е показана под полето.",
  },
  accessLine: "Вашият достъп: {gate} · роля: {role}",
  count: "Заявки: {count}",
  dataClasses: {
    account_auth: {
      label: "Акаунт и свързани auth данни",
      description:
        "Better Auth потребител, сесии и credential/provider accounts.",
    },
    public_identity: {
      label: "Псевдонимна публична идентичност",
      description:
        "Текущият профил и настоящите или предишните потребителски имена, свързани с акаунта. Стойности, имена за показване, термини на политиката и вътрешни ID не се показват.",
    },
    garden_workspace: {
      label: "Работно пространство на градината",
      description:
        "Собствени пространства и живи обекти, които закрепват историята.",
    },
    lineage_provenance: {
      label: "Произход и провенанс",
      description:
        "Провенанс в обхвата на собственика и лични взаимодействия, запазени чрез анонимизирани tombstones. Текст и контакти не се показват.",
    },
    journal_entries: {
      label: "Записи в дневника",
      description:
        "Лични и публични редове по жизнен цикъл. Заглавия и текст не се избират.",
    },
    media_assets: {
      label: "Производни медии и quarantine препратки",
      description:
        "Редове за обработка на снимки по статус, включително cover-only. Ключове и подписани URL не се избират.",
    },
    social_engagement: {
      label: "Социални и engagement редове",
      description:
        "Профилни follows/blocks, коментари, отметки и известия. Анонимните likes не се броят като връзка към акаунт.",
    },
    community: {
      label: "Общност и модераторски референции",
      description:
        "Членства, приноси и актьорски референции за модерация, които изискват rekey или cascade-delete.",
    },
    public_exposure: {
      label: "Публични slugs и tombstones",
      description:
        "Публикувани URL и архивирани записи, които връщат 410 Gone.",
    },
    analytics_events: {
      label: "Аналитични събития",
      description:
        "Собствени събития за активация, задържане и стойност на заявителя.",
    },
    catalog_provisional: {
      label: "Временни редове на каталога",
      description:
        "Временни карти в каталога, създадени от градинаря преди собствените имена, и обекти със собствено име като етикет.",
    },
    catalog_operator_links: {
      label: "Операторски връзки в каталога",
      description:
        "Soft връзки на рецензенти и автори към suggestions, aliases и seed proofs.",
    },
    search_index_artifacts: {
      label: "Артефакти на търсенето и индекса",
      description:
        "Публични записи с производни документи и journal jobs във всеки статус на опашката.",
    },
    erasure_operator_records: {
      label: "Операторски записи за изтриване",
      description: "Редове за приемане на заявки за изтриване.",
    },
  },
  countLabels: {
    user_row: "ред на потребителя",
    sessions: "сесии",
    accounts: "акаунти",
    publication_disclosures: "потвърждения за публикуване",
    profiles: "публични профили",
    current_handle_claims: "текущи потребителски имена",
    retired_handle_claims: "предишни потребителски имена",
    unreviewed_policy_rows: "непроверени от политиката редове",
    spaces: "пространства",
    plant_objects: "живи обекти",
    provenance_edges: "връзки на произхода",
    pending_identities: "чакащи самоличности",
    audit_events: "одитни събития",
    follows: "последвания",
    questions: "въпроси",
    total: "общо",
    public_active: "активни публични",
    deletion_pending: "чакат изтриване",
    object_mentions: "споменавания на обекти",
    catalog_mentions: "споменавания в каталога",
    quarantined: "в карантина",
    processed: "обработени",
    failed: "с грешка",
    cover_only: "само корица",
    explicit_cover_refs: "явни корици",
    profile_follows: "последвания на профили",
    profile_blocks: "блокирания на профили",
    comments: "коментари",
    bookmarks: "отметки",
    notification_receipts: "известия",
    memberships: "членства",
    contributions: "приноси",
    moderation_actor_refs: "препратки към модератори",
    public_slugs: "публични slugs",
    gone_tombstones: "410 tombstones",
    events: "събития",
    provisional_catalog_items: "временни елементи на каталога",
    own_name_objects: "обекти със собствено име",
    reviewer_or_author_links: "връзки рецензент/автор",
    public_active_entries: "активни публични записи",
    pending_index_jobs: "чакащи index jobs",
    pending_unindex_jobs: "чакащи unindex jobs",
    terminal_jobs_with_user_id: "терминални jobs с user id",
    erasure_requests: "заявки за изтриване",
  },
  caveats: [
    "Прегледът е недеструктивен и повторяем. Нищо не се изтрива или анонимизира.",
    "Броевете описват само класове данни; текст, ключове, имейли, токени, IP, user-agent, referrer и точно място не се показват.",
    "Окончателното необратимо изтриване или анонимизиране изисква одобрение и отделен операторски процес.",
  ],
};

const RU_COPY: OperatorErasureCopy = {
  metadataTitle: "Запросы на удаление | OverGarden",
  title: "Запросы на удаление",
  description:
    "Садоводы просят стереть свой аккаунт. Каждый запрос проходит шаги: рассмотрение, предварительный отчёт о том, что будет стёрто, и тогда — стирание или другой результат. Ничего не стирается без вашего отдельного подтверждения.",
  empty: "Запросов на удаление ещё не отправляли.",
  requestReference: "Номер запроса",
  requesterUserId: "ID аккаунта (для диагностики)",
  scope: "Объём",
  intakeVersion: "Версия формы",
  dryRunReviewed: "Отчёт просмотрен",
  handledStatus: "Результат",
  startReview: "Начать рассмотрение",
  executionRequiresOwner:
    "Стереть данные может только владелец или администратор.",
  executionTitle: "Стереть данные аккаунта",
  executionDescription:
    "Стирает или обезличивает всё, что принадлежит аккаунту: вход, профиль, сад, записи, фото, аналитику и служебные записи. Фото с известными ключами удаляются из хранилища; копии вне OverGarden — только по возможности. Отменить нельзя.",
  approvalPhrase: "Фраза подтверждения",
  confirmTitle: "Стереть данные по запросу",
  confirmDescription:
    "Будет стёрто или обезличено: {scope}. Отменить это невозможно. Публичные страницы аккаунта будут сообщать об удалении не более семи дней, а потом исчезнут.",
  confirmAction: "Да, стереть",
  confirmCancel: "Отмена",
  execute: "Стереть данные",
  reviewBeforeExecution:
    "Сначала отметьте предварительный отчёт просмотренным.",
  operatorOutcome: "Другой результат",
  markHandled: "Зафиксировать результат",
  previewTitle: "Предварительный отчёт: что будет стёрто",
  previewDescription:
    "Только какие данные и сколько. Отчёт ничего не меняет и не показывает содержимого: ни текстов, ни фото, ни адресов или контактов.",
  recordReviewAgain: "Отметить отчёт просмотренным ещё раз",
  markReviewed: "Отметить отчёт просмотренным",
  requester: "Аккаунт",
  requesterNoHandle: "без публичного ника",
  requesterErased: "уже стёрт",
  received: "Получен",
  nextTitle: "Следующий шаг",
  next: {
    startReview: "Начните рассмотрение.",
    reviewPreview:
      "Просмотрите предварительный отчёт ниже и отметьте его просмотренным.",
    decide:
      "Сотрите данные (нужна фраза подтверждения) или зафиксируйте другой результат.",
    resumeCleanup:
      "Данные аккаунта уже стёрты, но очистка фото и поиска ещё не подтверждена. Продолжите очистку.",
    waitingIdentity:
      "Запрос закрыт. Заявитель должен подтвердить личность через поддержку и отправить запрос снова.",
    nothing: "Ничего делать не нужно.",
  },
  technicalTitle: "Технические данные",
  retryCleanup: "Продолжить очистку",
  retryCleanupDescription:
    "Очистка продолжится с того места, где остановилась: фото из хранилища и страницы из поиска. Запрос станет выполненным только тогда, когда это подтвердится.",
  scopeLine:
    "пространства: {spaces}, живые объекты: {objects}, записи: {entries}, фото: {photos}",
  outcome: {
    savedTitle: "Сохранено",
    savedBody: "{reference}: {state}.",
    staleTitle: "Ничего не изменено",
    staleBody: "{reference} уже в другом состоянии: {state}.",
    approvalTitle: "Ничего не стёрто",
    approvalBody:
      "Фраза подтверждения не совпадает. Введите её точно так, как показано под полем.",
  },
  accessLine: "Ваш доступ: {gate} · роль: {role}",
  count: "Запросов: {count}",
  dataClasses: {
    account_auth: {
      label: "Аккаунт и связанные auth-данные",
      description:
        "Пользователь Better Auth, сессии и credential/provider accounts.",
    },
    public_identity: {
      label: "Псевдонимная публичная идентичность",
      description:
        "Текущий профиль и действующие или прежние ники, связанные с аккаунтом. Значения ников, отображаемые имена, термины политики и внутренние ID не показываются.",
    },
    garden_workspace: {
      label: "Рабочее пространство сада",
      description:
        "Собственные пространства и живые объекты, закрепляющие историю.",
    },
    lineage_provenance: {
      label: "Происхождение и провенанс",
      description:
        "Провенанс в пределах владельца и приватные взаимодействия, сохранённые через анонимизированные tombstones. Текст и контакты не показываются.",
    },
    journal_entries: {
      label: "Записи журнала",
      description:
        "Приватные и публичные строки по жизненному циклу. Заголовки и текст не выбираются.",
    },
    media_assets: {
      label: "Производные медиа и quarantine-ссылки",
      description:
        "Строки обработки фото по статусу, включая cover-only. Ключи и подписанные URL не выбираются.",
    },
    social_engagement: {
      label: "Социальные и engagement-строки",
      description:
        "Подписки/блоки профилей, комментарии, закладки и уведомления. Анонимные likes не считаются привязкой к аккаунту.",
    },
    community: {
      label: "Сообщество и модераторские ссылки",
      description:
        "Членства, вклады и актёрские ссылки модерации, требующие rekey или cascade-delete.",
    },
    public_exposure: {
      label: "Публичные slugs и tombstones",
      description:
        "Опубликованные URL и архивированные записи, возвращающие 410 Gone.",
    },
    analytics_events: {
      label: "События аналитики",
      description:
        "Собственные события активации, удержания и ценности заявителя.",
    },
    catalog_provisional: {
      label: "Временные строки каталога",
      description:
        "Временные карточки каталога, созданные садоводом до появления своих названий, и объекты со своим названием как меткой.",
    },
    catalog_operator_links: {
      label: "Операторские ссылки каталога",
      description:
        "Soft-ссылки рецензентов и авторов на suggestions, aliases и seed proofs.",
    },
    search_index_artifacts: {
      label: "Артефакты поиска и индекса",
      description:
        "Публичные записи с производными документами и journal jobs в любом статусе очереди.",
    },
    erasure_operator_records: {
      label: "Операторские записи удаления",
      description: "Строки приёма запросов на удаление.",
    },
  },
  countLabels: {
    user_row: "строка пользователя",
    sessions: "сессии",
    accounts: "аккаунты",
    publication_disclosures: "подтверждения публикации",
    profiles: "публичные профили",
    current_handle_claims: "текущие ники",
    retired_handle_claims: "прежние ники",
    unreviewed_policy_rows: "не проверенные политикой строки",
    spaces: "пространства",
    plant_objects: "живые объекты",
    provenance_edges: "связи происхождения",
    pending_identities: "ожидающие идентичности",
    audit_events: "события аудита",
    follows: "подписки",
    questions: "вопросы",
    total: "всего",
    public_active: "активные публичные",
    deletion_pending: "ожидают удаления",
    object_mentions: "упоминания объектов",
    catalog_mentions: "упоминания каталога",
    quarantined: "в карантине",
    processed: "обработанные",
    failed: "с ошибкой",
    cover_only: "только обложка",
    explicit_cover_refs: "явные обложки",
    profile_follows: "подписки профилей",
    profile_blocks: "блокировки профилей",
    comments: "комментарии",
    bookmarks: "закладки",
    notification_receipts: "уведомления",
    memberships: "членства",
    contributions: "вклады",
    moderation_actor_refs: "ссылки на модераторов",
    public_slugs: "публичные slugs",
    gone_tombstones: "410 tombstones",
    events: "события",
    provisional_catalog_items: "временные элементы каталога",
    own_name_objects: "объекты с собственным названием",
    reviewer_or_author_links: "ссылки рецензента/автора",
    public_active_entries: "активные публичные записи",
    pending_index_jobs: "ожидающие index jobs",
    pending_unindex_jobs: "ожидающие unindex jobs",
    terminal_jobs_with_user_id: "терминальные jobs с user id",
    erasure_requests: "запросы на удаление",
  },
  caveats: [
    "Просмотр недеструктивен и повторяем. Ничего не удаляется и не анонимизируется.",
    "Количество описывает только классы данных; текст, ключи, email, токены, IP, user-agent, referrer и точное место не показываются.",
    "Окончательное необратимое удаление или анонимизация требуют одобрения и отдельного операторского процесса.",
  ],
};

const COPY_BY_LOCALE = {
  uk: UK_COPY,
  bg: BG_COPY,
  ru: RU_COPY,
} satisfies Record<InterfaceLocale, OperatorErasureCopy>;

export function getOperatorErasureCopy(
  locale: InterfaceLocale,
): OperatorErasureCopy {
  return COPY_BY_LOCALE[locale];
}

export function operatorErasureCountLabel(
  locale: InterfaceLocale,
  key: string,
) {
  const labels = getOperatorErasureCopy(locale).countLabels as Record<
    string,
    string
  >;
  return labels[key] ?? key;
}
