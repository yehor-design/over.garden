import type { InterfaceLocale } from "@/lib/interface-localization";
import type { WidenCopy } from "@/lib/operator-copy";

const UK_COPY = {
  metrics: {
    closedPilotWriters: "Автори закритого пілоту",
    founderRehearsal: "Репетиція засновника",
    firstEntryActivations: "Активації першого запису",
    totalEntries: "Усього записів",
    activeGardeners: "Активні садівники",
    sameObjectFollowUps: "Повторні записи про той самий об'єкт",
    revisitFollowUp: "Повторний візит → запис",
    photoUsage: "Використання фото",
    offlineQueued: "Поставлено в офлайн-чергу",
    offlineSynced: "Синхронізовано з офлайну",
    offlineFailed: "Помилки офлайну",
    publishedEntries: "Опубліковані записи",
    publishRate: "Частка публікацій",
    archive410: "Архів / 410",
    homepageStartsSaves: "Старт із головної → збереження",
    publicVarietyStartsSaves: "Старт із публічного сорту → збереження",
    directGardenStartsSaves: "Прямий старт у саду → збереження",
    inviteStartsSaves: "Старт із запрошення → перше збереження",
    firstSaveRate: "Частка перших збережень",
    returningGardeners: "Садівники, які повернулися",
    responses: "Відповіді (надіслані + пропущені)",
    submittedSkipped: "Надіслано → пропущено",
    usefulness: "Корисно / не впевнений / не корисно",
    usefulRate: "Частка «корисно» серед надісланих",
    withReason: "З необов'язковою причиною",
    promotedIndexable: "Просунуті / indexable",
    thinNoindex: "Тонкі / noindex",
    demoted410: "Знижені через архів / 410",
    currentPublicVarieties: "Поточні публічні сорти",
  },
  health: {
    metadataTitle: "Стан пілоту | OverGarden",
    title: "Стан пілоту",
    description:
      "Операторський звіт за активацією журналу H1, поведінкою публікації H4 і траєкторією тонких сторінок публічних сортів H6. Він містить лише агреговані кількості та частки без тексту журналів, точного місцезнаходження, ключів медіа, метаданих запитів, необроблених URL, referrer, IP або user-agent.",
    provisionalStatus: "попередні сигнали пілоту",
    unavailable:
      "Звіт про стан пілоту тимчасово недоступний. Користувацьке збереження журналу не залежить від цього операторського читання.",
    windows: {
      last_7_days: "Останні 7 днів",
      last_30_days: "Останні 30 днів",
    },
    since: "Від {date}",
    writeAccessTitle: "Доступ до запису в закритому пілоті",
    writeAccessDescription:
      "Відрізняє реальних авторів закритого пілоту від репетицій засновника та незапрошених відвідувачів, які можуть читати публічні сторінки. Враховуються лише постійні записи дозволів без посилань, токенів або ідентичності отримувача.",
    mvpLearningTitle: "Навчання MVP (OVE-200)",
    mvpLearningDescription:
      "Окремі знаменники H1/H4 для real_self_serve і real_closed_pilot. Синтетичні / редакційні / бот класи лише у виключеннях. Політика {policyVersion} / утримання {retentionPolicyVersion}. Гейт: {decisionGate}.",
    mvpLearningSelfServeActivated: "Активовані self-serve",
    mvpLearningSelfServeH1: "Self-serve H1 утримані",
    mvpLearningSelfServeH4: "Self-serve H4 публікатори",
    mvpLearningSelfServeH4Rate: "Self-serve H4 частка публікації",
    mvpLearningClosedPilotActivated: "Активовані закритого пілоту",
    mvpLearningClosedPilotH1: "Закритий пілот H1 утримані",
    mvpLearningClosedPilotH4: "Закритий пілот H4 публікатори",
    mvpLearningClosedPilotH4Rate: "Закритий пілот H4 частка публікації",
    mvpLearningUnclassified: "Некласифіковані події",
    mvpLearningExcluded: "Виключені синтетичні садівники",
    mvpLearningH6:
      "Органічне залучення ще не вимірюється (H6). Статус: {status}; H1/H4 не можуть зробити стратегічне рішення зеленим.",
    rehearsalNote:
      "Дозволи репетиції засновника можуть перевіряти весь шлях продукту, але виключені з метрик рішення H1/OVE-53 для закритого пілоту.",
    publicVarietyTitle: "Індексованість публічних сортів",
    publicVarietyDescription:
      "Лише траєкторія H6. Вона відокремлює просунуті й тонкі сторінки сортів від фактичного органічного залучення та конверсії в реєстрацію.",
    threshold:
      "Поточний попередній поріг: {entries} активних публічних записів і {characters} символів сукупного тексту.",
    guardrailsTitle: "Правила інтерпретації",
    acquisitionTitle: "Намір залучення",
    publicVarietyRate:
      "Частка збережень із публічного сорту: {rate}. Старти — це серверні події наміру `/garden`, а не необроблені URL або referrer.",
    invitedLoopTitle: "Цикл запрошеної когорти",
    invitedLoopDescription:
      "Цикл H1 закритого пілоту: запрошений садівник зберігає перший запис і повертається до того самого об'єкта. Належність вимагає дозволу `closed_pilot` і enum-джерела `invited_cohort`, але ніколи не посилань, імен або email.",
    valuePulseTitle: "Пульс цінності повторного запису",
    valuePulseDescription:
      "Приватний обмежений відгук після збереження повторного запису про той самий об'єкт. Показуються лише агрегати enum без тексту журналу чи полів ідентичності.",
    notes: [
      "Усі числа — попередні провідні індикатори пілоту, а не підтверджені цілі OverGarden.",
      "Невдалі офлайн-зміни наразі зберігаються локально в Dexie браузера й не спостерігаються сервером.",
      "Індексованість H6 показує траєкторію тонкого контенту, а не органічне залучення чи конверсію в реєстрацію.",
      "Кількості запрошеної когорти описують цикл H1: старт, перше збереження і повернення до того самого об'єкта. Учасник має постійний дозвіл `closed_pilot` та enum-джерело `invited_cohort`; імена, email і посилання не використовуються.",
      "Автори з правом запису мають постійний рядок `closed_pilot` у `pilot_invite_grants`. Репетиції засновника рахуються окремо й виключені з метрик H1/OVE-53.",
      "Пульс цінності містить обмежений відгук після повторних записів. Властивості — лише enum; текст журналу, email, IP, user-agent, referrer і необроблені URL не зберігаються.",
    ],
    references: {
      "docs/product-research/OverGarden_B2_METRICS_v0.md": "Дерево метрик",
      "docs/product-research/KILL_CRITERIA_PREREG_v2.md": "Критерії зупинки",
      "docs/product-research/VIRALITY_RESEARCH_FINAL.md":
        "Калібратори віральності",
      "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md":
        "Архітектура SEO-контенту",
    },
  },
} as const;

export type OperatorPilotCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY: OperatorPilotCopy = {
  ...UK_COPY,
  metrics: {
    closedPilotWriters: "Автори в затворения пилот",
    founderRehearsal: "Репетиция на основателя",
    firstEntryActivations: "Активации с първи запис",
    totalEntries: "Общо записи",
    activeGardeners: "Активни градинари",
    sameObjectFollowUps: "Последващи записи за същия обект",
    revisitFollowUp: "Повторно посещение → запис",
    photoUsage: "Използване на снимки",
    offlineQueued: "Поставени в офлайн опашка",
    offlineSynced: "Синхронизирани офлайн записи",
    offlineFailed: "Неуспешни офлайн записи",
    publishedEntries: "Публикувани записи",
    publishRate: "Дял на публикациите",
    archive410: "Архив / 410",
    homepageStartsSaves: "Старт от началната → запис",
    publicVarietyStartsSaves: "Старт от публичен сорт → запис",
    directGardenStartsSaves: "Директен старт в градината → запис",
    inviteStartsSaves: "Старт от покана → първи запис",
    firstSaveRate: "Дял на първите записи",
    returningGardeners: "Завърнали се градинари",
    responses: "Отговори (подадени + пропуснати)",
    submittedSkipped: "Подадени → пропуснати",
    usefulness: "Полезно / не съм сигурен / неполезно",
    usefulRate: "Дял „полезно“ сред подадените",
    withReason: "С незадължителна причина",
    promotedIndexable: "Популяризирани / indexable",
    thinNoindex: "Оскъдни / noindex",
    demoted410: "Понижени чрез архив / 410",
    currentPublicVarieties: "Текущи публични сортове",
  },
  health: {
    ...UK_COPY.health,
    metadataTitle: "Състояние на пилота | OverGarden",
    title: "Състояние на пилота",
    description:
      "Операторски отчет за активацията на дневника H1, поведението при публикуване H4 и траекторията на оскъдните публични страници за сортове H6. Съдържа само агрегирани броеве и дялове без текст от дневници, точно местоположение, медийни ключове, метаданни на заявки, необработени URL, referrer, IP или user-agent.",
    provisionalStatus: "предварителни сигнали от пилота",
    unavailable:
      "Отчетът за пилота временно не е наличен. Потребителското записване в дневника не зависи от това операторско четене.",
    windows: {
      last_7_days: "Последните 7 дни",
      last_30_days: "Последните 30 дни",
    },
    since: "От {date}",
    writeAccessTitle: "Достъп за писане в затворения пилот",
    writeAccessDescription:
      "Разграничава реалните автори в затворения пилот от репетициите на основателя и непоканените посетители. Броят се само трайни разрешения без връзки, токени или самоличност на получателя.",
    mvpLearningTitle: "MVP обучение (OVE-200)",
    mvpLearningDescription:
      "Отделни знаменатели H1/H4 за real_self_serve и real_closed_pilot. Синтетичните / редакционните / бот класове са само изключения. Политика {policyVersion} / задържане {retentionPolicyVersion}. Гейт: {decisionGate}.",
    mvpLearningSelfServeActivated: "Активирани self-serve",
    mvpLearningSelfServeH1: "Self-serve H1 задържани",
    mvpLearningSelfServeH4: "Self-serve H4 публикуващи",
    mvpLearningSelfServeH4Rate: "Self-serve H4 дял публикации",
    mvpLearningClosedPilotActivated: "Активирани в затворения пилот",
    mvpLearningClosedPilotH1: "Затворен пилот H1 задържани",
    mvpLearningClosedPilotH4: "Затворен пилот H4 публикуващи",
    mvpLearningClosedPilotH4Rate: "Затворен пилот H4 дял публикации",
    mvpLearningUnclassified: "Некласифицирани събития",
    mvpLearningExcluded: "Изключени синтетични градинари",
    mvpLearningH6:
      "Органичното привличане все още не се измерва (H6). Статус: {status}; H1/H4 не могат да направят стратегическото решение зелено.",
    rehearsalNote:
      "Разрешенията за репетиция могат да проверяват целия продуктов път, но са изключени от H1/OVE-53 метриките за решение.",
    publicVarietyTitle: "Индексируемост на публичните сортове",
    publicVarietyDescription:
      "Само траектория H6. Тя отделя популяризираните и оскъдни страници от реалното органично привличане и регистрация.",
    threshold:
      "Текущ предварителен праг: {entries} активни публични записа и {characters} знака общ текст.",
    guardrailsTitle: "Правила за тълкуване",
    acquisitionTitle: "Намерение за придобиване",
    publicVarietyRate:
      "Дял на записите от публичен сорт: {rate}. Стартовете са сървърни събития за намерение `/garden`, а не необработени URL или referrer.",
    invitedLoopTitle: "Цикъл на поканената кохорта",
    invitedLoopDescription:
      "H1 цикълът: поканен градинар записва първи запис и се връща към същия обект. Членството изисква `closed_pilot` и enum източник `invited_cohort`, никога връзки, имена или имейли.",
    valuePulseTitle: "Пулс на стойността при последващ запис",
    valuePulseDescription:
      "Лична ограничена обратна връзка след последващ запис за същия обект. Показват се само enum агрегати без текст от дневника или идентифициращи полета.",
    notes: [
      "Всички числа са предварителни водещи индикатори, а не потвърдени цели на OverGarden.",
      "Неуспешните офлайн промени остават локално в Dexie и не се наблюдават от сървъра.",
      "Индексируемостта H6 показва траекторията на оскъдното съдържание, не органичното привличане или регистрация.",
      "Поканената кохорта описва H1 цикъла със `closed_pilot` и enum източник `invited_cohort`; имена, имейли и връзки не се използват.",
      "Авторите имат траен ред `closed_pilot` в `pilot_invite_grants`; репетициите се броят отделно и са изключени от H1/OVE-53.",
      "Пулсът на стойността съдържа само enum обратна връзка; текст, имейл, IP, user-agent, referrer и необработени URL не се пазят.",
    ],
    references: {
      "docs/product-research/OverGarden_B2_METRICS_v0.md": "Дърво на метриките",
      "docs/product-research/KILL_CRITERIA_PREREG_v2.md": "Критерии за спиране",
      "docs/product-research/VIRALITY_RESEARCH_FINAL.md":
        "Калибратори на виралността",
      "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md":
        "Архитектура на SEO съдържанието",
    },
  },
};

const RU_COPY: OperatorPilotCopy = {
  ...UK_COPY,
  metrics: {
    closedPilotWriters: "Авторы закрытого пилота",
    founderRehearsal: "Репетиция основателя",
    firstEntryActivations: "Активации первого сохранения",
    totalEntries: "Всего записей",
    activeGardeners: "Активные садоводы",
    sameObjectFollowUps: "Повторные записи о том же объекте",
    revisitFollowUp: "Повторный визит → запись",
    photoUsage: "Использование фото",
    offlineQueued: "Поставлено в офлайн-очередь",
    offlineSynced: "Синхронизировано из офлайна",
    offlineFailed: "Ошибки офлайна",
    publishedEntries: "Опубликованные записи",
    publishRate: "Доля публикаций",
    archive410: "Архив / 410",
    homepageStartsSaves: "Старт с главной → сохранение",
    publicVarietyStartsSaves: "Старт с публичного сорта → сохранение",
    directGardenStartsSaves: "Прямой старт в саду → сохранение",
    inviteStartsSaves: "Старт по приглашению → первое сохранение",
    firstSaveRate: "Доля первых сохранений",
    returningGardeners: "Вернувшиеся садоводы",
    responses: "Ответы (отправленные + пропущенные)",
    submittedSkipped: "Отправлено → пропущено",
    usefulness: "Полезно / не уверен / не полезно",
    usefulRate: "Доля «полезно» среди отправленных",
    withReason: "С необязательной причиной",
    promotedIndexable: "Продвинутые / indexable",
    thinNoindex: "Тонкие / noindex",
    demoted410: "Пониженные через архив / 410",
    currentPublicVarieties: "Текущие публичные сорта",
  },
  health: {
    ...UK_COPY.health,
    metadataTitle: "Состояние пилота | OverGarden",
    title: "Состояние пилота",
    description:
      "Операторский отчёт по активации журнала H1, поведению публикации H4 и траектории тонких публичных страниц сортов H6. Содержит только агрегированные количества и доли без текста журналов, точного местоположения, ключей медиа, метаданных запросов, необработанных URL, referrer, IP или user-agent.",
    provisionalStatus: "предварительные сигналы пилота",
    unavailable:
      "Отчёт о состоянии пилота временно недоступен. Пользовательское сохранение журнала от него не зависит.",
    windows: {
      last_7_days: "Последние 7 дней",
      last_30_days: "Последние 30 дней",
    },
    since: "С {date}",
    writeAccessTitle: "Доступ к записи в закрытом пилоте",
    writeAccessDescription:
      "Отличает реальных авторов закрытого пилота от репетиций основателя и незваных посетителей. Учитываются только постоянные разрешения без ссылок, токенов или личности получателя.",
    mvpLearningTitle: "Обучение MVP (OVE-200)",
    mvpLearningDescription:
      "Отдельные знаменатели H1/H4 для real_self_serve и real_closed_pilot. Синтетические / редакционные / бот классы только в исключениях. Политика {policyVersion} / удержание {retentionPolicyVersion}. Гейт: {decisionGate}.",
    mvpLearningSelfServeActivated: "Активированные self-serve",
    mvpLearningSelfServeH1: "Self-serve H1 удержанные",
    mvpLearningSelfServeH4: "Self-serve H4 публикующие",
    mvpLearningSelfServeH4Rate: "Self-serve H4 доля публикаций",
    mvpLearningClosedPilotActivated: "Активированные закрытого пилота",
    mvpLearningClosedPilotH1: "Закрытый пилот H1 удержанные",
    mvpLearningClosedPilotH4: "Закрытый пилот H4 публикующие",
    mvpLearningClosedPilotH4Rate: "Закрытый пилот H4 доля публикаций",
    mvpLearningUnclassified: "Неклассифицированные события",
    mvpLearningExcluded: "Исключённые синтетические садоводы",
    mvpLearningH6:
      "Органическое привлечение пока не измеряется (H6). Статус: {status}; H1/H4 не могут сделать стратегическое решение зелёным.",
    rehearsalNote:
      "Разрешения репетиции проверяют весь путь продукта, но исключены из метрик решения H1/OVE-53.",
    publicVarietyTitle: "Индексируемость публичных сортов",
    publicVarietyDescription:
      "Только траектория H6. Она отделяет продвинутые и тонкие страницы от реального органического привлечения и регистрации.",
    threshold:
      "Текущий предварительный порог: {entries} активных публичных записей и {characters} символов совокупного текста.",
    guardrailsTitle: "Правила интерпретации",
    acquisitionTitle: "Намерение привлечения",
    publicVarietyRate:
      "Доля сохранений с публичного сорта: {rate}. Старты — серверные события намерения `/garden`, а не необработанные URL или referrer.",
    invitedLoopTitle: "Цикл приглашённой когорты",
    invitedLoopDescription:
      "Цикл H1: приглашённый садовод сохраняет первую запись и возвращается к тому же объекту. Требуются `closed_pilot` и enum-источник `invited_cohort`, но не ссылки, имена или email.",
    valuePulseTitle: "Пульс ценности повторной записи",
    valuePulseDescription:
      "Приватный ограниченный отзыв после повторной записи. Показываются только enum-агрегаты без текста журнала или идентифицирующих полей.",
    notes: [
      "Все числа — предварительные ведущие индикаторы, а не подтверждённые цели OverGarden.",
      "Неудачные офлайн-изменения остаются локально в Dexie и не наблюдаются сервером.",
      "Индексируемость H6 показывает траекторию тонкого контента, а не органическое привлечение или регистрацию.",
      "Приглашённая когорта описывает цикл H1 с `closed_pilot` и enum-источником `invited_cohort`; имена, email и ссылки не используются.",
      "Авторы имеют постоянную строку `closed_pilot` в `pilot_invite_grants`; репетиции считаются отдельно и исключены из H1/OVE-53.",
      "Пульс ценности содержит только enum-отзывы; текст, email, IP, user-agent, referrer и необработанные URL не сохраняются.",
    ],
    references: {
      "docs/product-research/OverGarden_B2_METRICS_v0.md": "Дерево метрик",
      "docs/product-research/KILL_CRITERIA_PREREG_v2.md": "Критерии остановки",
      "docs/product-research/VIRALITY_RESEARCH_FINAL.md":
        "Калибраторы виральности",
      "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md":
        "Архитектура SEO-контента",
    },
  },
};

const COPY_BY_LOCALE = {
  uk: UK_COPY,
  bg: BG_COPY,
  ru: RU_COPY,
} satisfies Record<InterfaceLocale, OperatorPilotCopy>;

export function getOperatorPilotCopy(
  locale: InterfaceLocale,
): OperatorPilotCopy {
  return COPY_BY_LOCALE[locale];
}
