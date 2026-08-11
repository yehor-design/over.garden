import type { InterfaceLocale } from "@/lib/interface-localization";
import type { WidenCopy } from "@/lib/operator-copy";

const UK_COPY = {
  metadataTitle: "Запити на видалення | OverGarden",
  title: "Запити на видалення",
  description:
    "Операторський перегляд недеструктивного приймання запитів пілоту. Кожен запит має повторюваний dry-run-перегляд класів даних до будь-якого схваленого супроводжувачем деструктивного процесу. Список навмисно не містить тексту журналів, ключів медіа, точного місцезнаходження, заголовків запитів, referrer, IP або user-agent.",
  empty: "Запитів на видалення ще не надіслано.",
  requestReference: "Посилання на запит",
  requesterUserId: "ID користувача-заявника (лише для оператора)",
  scope: "Обсяг",
  intakeVersion: "Версія приймання",
  dryRunReviewed: "Dry-run перевірено",
  handledStatus: "Статус опрацювання",
  startReview: "Почати розгляд",
  executionRequiresOwner:
    "Для незворотного видалення потрібен доступ власника або адміністратора.",
  executionTitle: "Незворотне видалення, схвалене супроводжувачем",
  executionDescription:
    "Виконання видаляє або анонімізує пов'язані із заявником дані поточної схеми: обліковий запис, журнал, медіа, аналітику, тимчасові записи каталогу, search jobs та операторські записи пілоту. Об'єкти R2 під контролем OverGarden видаляються, якщо ключі ще відомі; копії зовнішніх crawler, пошукових систем або AI видаляються лише за можливості.",
  approvalPhrase: "Фраза схвалення супроводжувача",
  execute: "Виконати схвалене видалення",
  reviewBeforeExecution:
    "Зафіксуйте перевірку dry-run перед незворотним виконанням.",
  operatorOutcome: "Результат оператора",
  markHandled: "Позначити опрацьованим",
  previewTitle: "Недеструктивний dry-run-перегляд",
  previewDescription:
    "Лише класи даних і кількості, яких це торкнеться. Перегляд нічого не видаляє, не анонімізує й не розкриває необроблений текст журналів, ключі медіа, email, токени, IP, user-agent, referrer або точне місцезнаходження.",
  recordReviewAgain: "Зафіксувати dry-run повторно",
  markReviewed: "Позначити dry-run перевіреним",
  dataClasses: {
    account_auth: {
      label: "Обліковий запис і пов'язані дані автентифікації",
      description:
        "Рядок користувача Better Auth, пов'язані сесії, credential/provider accounts і дозвіл запрошення до закритого пілоту.",
    },
    public_identity: {
      label: "Псевдонімна публічна ідентичність",
      description:
        "Поточний профіль і чинні або колишні ніки, пов’язані з обліковим записом. Значення ніків, імена для показу, терміни політики та внутрішні ID не показуються.",
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
        "Підписки/блоки профілів, wishlist, коментарі, закладки та сповіщення. Анонімні likes не обліковуються як прив'язка до акаунта.",
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
        "Додані користувачем кандидати каталогу й об'єкти зі статусом `user_added`.",
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
    accounts: "облікові записи",
    pilot_invite_grant: "дозвіл запрошення",
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
    private_active: "активні приватні",
    public_active: "активні публічні",
    archived: "архівовані",
    object_mentions: "згадки об'єктів",
    catalog_mentions: "згадки каталогу",
    quarantined: "у quarantine",
    processed: "оброблені",
    failed: "з помилкою",
    cover_only: "лише обкладинка",
    explicit_cover_refs: "явні обкладинки",
    profile_follows: "підписки профілів",
    profile_blocks: "блоки профілів",
    wishlist_items: "wishlist",
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
    user_added_objects: "об'єкти user_added",
    reviewer_or_author_links: "посилання рецензента/автора",
    public_active_entries: "активні публічні записи",
    pending_index_jobs: "очікувані index jobs",
    pending_unindex_jobs: "очікувані unindex jobs",
    terminal_jobs_with_user_id: "термінальні jobs з user id",
    erasure_requests: "запити на видалення",
  },
  caveats: [
    "Перегляд недеструктивний і повторюваний. Перегляд не видаляє й не анонімізує дані облікового запису, саду, походження, журналу, медіа, пошуку або аналітики.",
    "Кількості описують лише класи даних. Необроблений текст журналів, ключі медіа, email, токени, IP, user-agent, referrer і точне місцезнаходження не потрапляють до цієї моделі.",
    "Остаточне незворотне видалення або анонімізація все одно потребують схвалення супроводжувача й окремого операторського процесу.",
  ],
} as const;

export type OperatorErasureCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY: OperatorErasureCopy = {
  ...UK_COPY,
  metadataTitle: "Заявки за изтриване | OverGarden",
  title: "Заявки за изтриване",
  description:
    "Операторски преглед на недеструктивното приемане на заявки. Всяка заявка има повторяем dry-run на класовете данни преди одобрен разрушителен процес. Списъкът умишлено не съдържа текст от дневници, медийни ключове, точно местоположение, headers, referrer, IP или user-agent.",
  empty: "Все още няма подадени заявки за изтриване.",
  requestReference: "Референция на заявката",
  requesterUserId: "Потребителски ID на заявителя (само за оператор)",
  scope: "Обхват",
  intakeVersion: "Версия на приемането",
  dryRunReviewed: "Dry-run е прегледан",
  handledStatus: "Статус на обработката",
  startReview: "Започни преглед",
  executionRequiresOwner:
    "Необратимото изтриване изисква достъп на собственик или администратор.",
  executionTitle: "Необратимо изтриване, одобрено от поддържащия",
  executionDescription:
    "Изпълнението изтрива или анонимизира свързаните със заявителя данни от текущата схема: профил, дневник, медии, аналитика, временен каталог, search jobs и операторски записи. R2 обектите се изтриват, ако ключовете са известни; външните копия се премахват при възможност.",
  approvalPhrase: "Фраза за одобрение",
  execute: "Изпълни одобреното изтриване",
  reviewBeforeExecution:
    "Запиши прегледа на dry-run преди необратимо изпълнение.",
  operatorOutcome: "Резултат на оператора",
  markHandled: "Отбележи като обработено",
  previewTitle: "Недеструктивен dry-run преглед",
  previewDescription:
    "Само засегнати класове и броеве. Прегледът не изтрива, не анонимизира и не разкрива текст, медийни ключове, имейли, токени, IP, user-agent, referrer или точно местоположение.",
  recordReviewAgain: "Запиши dry-run отново",
  markReviewed: "Отбележи dry-run като прегледан",
  dataClasses: {
    account_auth: {
      label: "Профил и свързани auth данни",
      description:
        "Better Auth потребител, сесии, credential/provider accounts и разрешение за затворения пилот.",
    },
    public_identity: {
      label: "Псевдонимна публична идентичност",
      description:
        "Текущият профил и настоящите или предишните потребителски имена, свързани с профила. Стойности, имена за показване, термини на политиката и вътрешни ID не се показват.",
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
        "Профилни follows/blocks, wishlist, коментари, отметки и известия. Анонимните likes не се броят като връзка към акаунт.",
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
        "Добавени от потребителя кандидати и обекти със статус `user_added`.",
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
    ...UK_COPY.countLabels,
    cover_only: "само корица",
    explicit_cover_refs: "явни корици",
    profile_follows: "профилни follows",
    profile_blocks: "профилни блокирания",
    wishlist_items: "wishlist",
    comments: "коментари",
    bookmarks: "отметки",
    notification_receipts: "известия",
    memberships: "членства",
    contributions: "приноси",
    moderation_actor_refs: "актьорски референции",
    reviewer_or_author_links: "връзки рецензент/автор",
    terminal_jobs_with_user_id: "терминални jobs с user id",
  },
  caveats: [
    "Прегледът е недеструктивен и повторяем. Нищо не се изтрива или анонимизира.",
    "Броевете описват само класове данни; текст, ключове, имейли, токени, IP, user-agent, referrer и точно място не се показват.",
    "Окончателното необратимо изтриване или анонимизиране изисква одобрение и отделен операторски процес.",
  ],
};

const RU_COPY: OperatorErasureCopy = {
  ...UK_COPY,
  metadataTitle: "Запросы на удаление | OverGarden",
  title: "Запросы на удаление",
  description:
    "Операторский просмотр недеструктивного приёма запросов. Каждый запрос имеет повторяемый dry-run классов данных до одобренного разрушительного процесса. Список намеренно не содержит текст журналов, ключи медиа, точное местоположение, headers, referrer, IP или user-agent.",
  empty: "Запросов на удаление пока не отправлено.",
  requestReference: "Ссылка на запрос",
  requesterUserId: "ID пользователя-заявителя (только для оператора)",
  scope: "Объём",
  intakeVersion: "Версия приёма",
  dryRunReviewed: "Dry-run проверен",
  handledStatus: "Статус обработки",
  startReview: "Начать рассмотрение",
  executionRequiresOwner:
    "Для необратимого удаления нужен доступ владельца или администратора.",
  executionTitle: "Необратимое удаление, одобренное сопровождающим",
  executionDescription:
    "Выполнение удаляет или анонимизирует связанные с заявителем данные текущей схемы: профиль, журнал, медиа, аналитику, временный каталог, search jobs и операторские записи. Объекты R2 удаляются, если ключи известны; внешние копии удаляются по возможности.",
  approvalPhrase: "Фраза одобрения",
  execute: "Выполнить одобренное удаление",
  reviewBeforeExecution:
    "Зафиксируйте проверку dry-run до необратимого выполнения.",
  operatorOutcome: "Результат оператора",
  markHandled: "Отметить обработанным",
  previewTitle: "Недеструктивный dry-run",
  previewDescription:
    "Только затронутые классы и количества. Просмотр не удаляет, не анонимизирует и не раскрывает текст, ключи медиа, email, токены, IP, user-agent, referrer или точное местоположение.",
  recordReviewAgain: "Зафиксировать dry-run повторно",
  markReviewed: "Отметить dry-run проверенным",
  dataClasses: {
    account_auth: {
      label: "Профиль и связанные auth-данные",
      description:
        "Пользователь Better Auth, сессии, credential/provider accounts и разрешение закрытого пилота.",
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
        "Подписки/блоки профилей, wishlist, комментарии, закладки и уведомления. Анонимные likes не считаются привязкой к аккаунту.",
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
        "Добавленные пользователем кандидаты и объекты со статусом `user_added`.",
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
    ...UK_COPY.countLabels,
    cover_only: "только обложка",
    explicit_cover_refs: "явные обложки",
    profile_follows: "подписки профилей",
    profile_blocks: "блоки профилей",
    wishlist_items: "wishlist",
    comments: "комментарии",
    bookmarks: "закладки",
    notification_receipts: "уведомления",
    memberships: "членства",
    contributions: "вклады",
    moderation_actor_refs: "актёрские ссылки модерации",
    reviewer_or_author_links: "ссылки рецензента/автора",
    terminal_jobs_with_user_id: "терминальные jobs с user id",
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
