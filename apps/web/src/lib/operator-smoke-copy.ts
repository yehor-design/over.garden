import type { InterfaceLocale } from "@/lib/interface-localization";
import type { WidenCopy } from "@/lib/operator-copy";

const UK_COPY = {
  metadataTitle: "Перевірка пілоту | OverGarden",
  title: "Production-перевірка пілоту",
  description:
    "Операторський контракт готовності й smoke-перевірки розгорнутого шляху першого користувача: автентифікація, фіксація журналу, похідні фото, публічний SSR, архівація в 410, активація публічного сорту, агрегований стан пілоту та стан пошуку й worker.",
  readinessStatus: "Стан готовності",
  generatedDescription:
    "Сформовано {date}. Ручні перевірки очікувані: ця сторінка є smoke-контрактом, а не заміною реального проходження в браузері за розгорнутим URL.",
  overall: {
    ready: "готово",
    degraded: "частково готово",
    blocked: "заблоковано",
  },
  severities: {
    pass: "пройдено",
    warn: "увага",
    fail: "помилка",
    manual: "вручну",
  },
  severitySummaries: {
    pass: "Автоматична перевірка виконана успішно.",
    warn: "Перевірка виявила умову, яку слід переглянути до запуску.",
    fail: "Перевірка виявила блокер запуску.",
    manual: "Цей пункт потрібно підтвердити вручну з редагованим доказом.",
  },
  diagnosticCheck: "Діагностична перевірка",
  literalEvidence: "Буквальний діагностичний доказ",
  sections: {
    deployment: "Розгортання та публічний доступ",
    "auth-data-media": "Автентифікація, дані та медіа",
    "public-surfaces": "Публічний SSR, видалення та активація",
    "search-worker-health": "Стан пошуку та worker",
    "durability-recovery": "Резервні копії та відновлення worker",
  },
  checkLabels: {
    "deployment-public-access": "Публічний доступ без автентифікації",
    "cloudflare-html-cache": "Кеш HTML у Cloudflare",
    "media-derivative-readback": "Читання лише похідних медіа",
    "public-entry-ssr": "SSR публічного журналу",
    "archive-410": "Архівація в 410",
    "public-variety-activation": "Активація публічного сорту",
    "invited-cohort-loop": "Цикл запрошеної когорти",
    "journal-search-worker": "Завдання worker пошуку журналів",
    "database-backup-pitr": "Резервні копії та PITR керованого Postgres",
    "worker-process-manager": "Менеджер процесів worker / Meili",
    "worker-restart-recovery": "Перезапуск і відновлення worker",
    "database-config": "Runtime і прямі URL Postgres",
    "vercel-runtime": "Runtime Vercel",
    "r2-config": "Buckets Cloudflare R2 і публічний базовий URL",
    "admin-role-access-model": "Модель доступу адміністративних ролей",
    "erasure-operator-boundary": "Операторська межа видалення",
    "pilot-invite-signing-secret": "Secret підпису пілотного запрошення",
    "better-auth-secret": "Secret Better Auth",
    "resend-auth-email-provider": "Провайдер auth-листів Resend",
    "auth-email-verification-policy": "Політика перевірки email",
    "google-oauth-provider": "Провайдер Google OAuth",
  },
  smokeSequence: "Послідовність smoke-перевірки",
  redactionRulesTitle: "Правила редагування доказів",
  referencesTitle: "Посилання",
  smokeSteps: [
    "Відкрийте розгорнутий публічний URL і підтвердьте, що `/`, `/health`, `/garden` і `/privacy` повертають HTML OverGarden, а не автентифікацію провайдера розгортання.",
    "Запустіть Google OAuth із `/garden`, підтвердьте точний callback без `redirect_uri_mismatch` або `INVALID_ORIGIN` і повернення на `/garden` без запису auth-параметрів.",
    "Створіть обліковий запис з email і паролем, підтвердьте доставку листа від схваленого відправника OverGarden, відкрийте посилання перевірки та поверніться на `/garden` без запису URL із токеном.",
    "Запросіть скидання пароля з `/auth/help`, підтвердьте доставку листа, задайте новий пароль і переконайтеся, що після повернення на `/garden` дані того самого саду збережено.",
    "Увійдіть як тестовий користувач пілоту й створіть перший запис про рослину через `/garden`.",
    "Для наявного облікового запису з email і паролем один раз увійдіть, пов'яжіть Google у `/garden`, вийдіть і поверніться через Google. Дані саду й дозвіл запрошення мають лишитися в того самого user ID OverGarden.",
    "Додайте фото, обробіть його й підтвердьте, що авторизоване читання показує лише URL публічної очищеної похідної.",
    "Додайте повторний запис до того самого об'єкта й підтвердьте, що дублікат об'єкта не створено.",
    "Опублікуйте перший запис після прийняття disclosure й підтвердьте, що `/journal/[slug]` має SSR, noindex, не розкриває точне місце та показує лише похідні медіа.",
    "Відкрийте пов'язаний `/variety/[slug]`, поверніться CTA до `/garden` і збережіть другий шлях першого запису з атрибуцією активації публічного сорту.",
    "Відкрийте noindex `/join`, підтвердьте відсутність у sitemap, перейдіть до `/garden?source=invited-cohort`, збережіть перший і повторний записи та перевірте агрегований цикл у `/garden/pilot-health`.",
    "Архівуйте опублікований запис і підтвердьте HTTP 410 Gone за старим публічним URL.",
    "Відкрийте `/garden/pilot-health` і підтвердьте оновлення агрегованих H1/H4/H6 без необроблених приватних даних.",
    "Відкрийте `/admin` як звичайний Google-користувач і підтвердьте відмову; потім увійдіть спеціальним owner-обліковим записом з email/паролем і підтвердьте постійний доступ `admin_user_roles`.",
    "Перевірте `/garden/privacy/erasure-requests` як гість, звичайний користувач і owner. Лише owner має читати обмежений стан і виконувати схвалене видалення; не записуйте ID, email, текст, ключі медіа або метадані запиту.",
    "Перевірте typeahead каталогу або matching service, а потім обробку `journal_entry_index` і `journal_entry_unindex` з редагованими доказами `job_queue` та Meilisearch.",
    "До запрошення користувачів підтвердьте backup/PITR керованого Postgres і smoke перезапуску worker зі збереженням безпечного публічного контракту пошуку. Зберігайте лише редаговані докази.",
  ],
  redactionRules: [
    "Не фіксуйте необроблені заголовки або текст журналу в smoke-доказах.",
    "Не фіксуйте email, підписані cookies, токени, API keys, URL бази даних або Vercel SSO URL із nonce.",
    "Не фіксуйте quarantine keys, підписані upload URL, ключі оригіналів, EXIF, IP, user-agent, referrer або необроблені query strings.",
    "Не фіксуйте точне місцезнаходження. Доказ може зазначати лише приховане місце або регіон.",
  ],
  references: {
    "docs/SDD_VERTICAL_SLICE_ROADMAP.md": "SDD roadmap",
    "docs/PRODUCTION_PILOT_SMOKE.md": "Production smoke пілоту",
    "docs/INFRASTRUCTURE_REGISTRY.md": "Реєстр інфраструктури",
    "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md":
      "Дослідження SEO / H6",
    "docs/product-research/AI_SEO_SYNTHESIS_v0.md": "Синтез AI crawler і WAF",
    "docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md":
      "Контроль приватності та видалення",
  },
} as const;

export type OperatorSmokeCopy = WidenCopy<typeof UK_COPY>;

const BG_COPY: OperatorSmokeCopy = {
  ...UK_COPY,
  metadataTitle: "Проверка на пилота | OverGarden",
  title: "Production проверка на пилота",
  description:
    "Операторски договор за готовност и smoke проверка на разгърнатия път на първия потребител: автентикация, дневник, производни снимки, публичен SSR, архивиране към 410, активация от публичен сорт, агрегирано състояние и търсене/worker.",
  readinessStatus: "Състояние на готовността",
  generatedDescription:
    "Генерирано {date}. Ръчните проверки са очаквани: тази страница е smoke договор, а не заместител на реално преминаване в браузър по разгърнатия URL.",
  overall: {
    ready: "готово",
    degraded: "частично готово",
    blocked: "блокирано",
  },
  severities: {
    pass: "успешно",
    warn: "внимание",
    fail: "грешка",
    manual: "ръчно",
  },
  severitySummaries: {
    pass: "Автоматичната проверка е успешна.",
    warn: "Проверката откри условие за преглед преди пускане.",
    fail: "Проверката откри блокер за пускане.",
    manual:
      "Тази точка изисква ръчно потвърждение с редактирано доказателство.",
  },
  diagnosticCheck: "Диагностична проверка",
  literalEvidence: "Буквално диагностично доказателство",
  sections: {
    deployment: "Разгръщане и публичен достъп",
    "auth-data-media": "Автентикация, данни и медии",
    "public-surfaces": "Публичен SSR, изтриване и активация",
    "search-worker-health": "Състояние на търсенето и worker",
    "durability-recovery": "Архивиране и възстановяване на worker",
  },
  checkLabels: {
    "deployment-public-access": "Публичен достъп без автентикация",
    "cloudflare-html-cache": "HTML кеш в Cloudflare",
    "media-derivative-readback": "Прочит само на производни медии",
    "public-entry-ssr": "SSR на публичния дневник",
    "archive-410": "Архивиране към 410",
    "public-variety-activation": "Активация от публичен сорт",
    "invited-cohort-loop": "Цикъл на поканената кохорта",
    "journal-search-worker": "Задачи на worker за търсене в дневника",
    "database-backup-pitr": "Архивиране и PITR на управляван Postgres",
    "worker-process-manager": "Мениджър на worker / Meili процеси",
    "worker-restart-recovery": "Рестарт и възстановяване на worker",
    "database-config": "Runtime и директни URL на Postgres",
    "vercel-runtime": "Runtime на Vercel",
    "r2-config": "Cloudflare R2 buckets и публичен базов URL",
    "admin-role-access-model": "Модел за достъп на административните роли",
    "erasure-operator-boundary": "Операторска граница за изтриване",
    "pilot-invite-signing-secret": "Secret за подписване на пилотна покана",
    "better-auth-secret": "Secret на Better Auth",
    "resend-auth-email-provider": "Resend доставчик на auth имейли",
    "auth-email-verification-policy": "Политика за проверка на имейл",
    "google-oauth-provider": "Доставчик Google OAuth",
  },
  smokeSequence: "Последователност на smoke проверката",
  redactionRulesTitle: "Правила за редактиране на доказателства",
  referencesTitle: "Препратки",
  smokeSteps: [
    "Отвори публичния URL и потвърди, че `/`, `/health`, `/garden` и `/privacy` връщат HTML на OverGarden, а не вход на доставчика.",
    "Стартирай Google OAuth от `/garden`, потвърди точния callback без `redirect_uri_mismatch` или `INVALID_ORIGIN` и връщане към `/garden` без запис на auth параметри.",
    "Създай профил с имейл и парола, потвърди писмото от одобрения подател, отвори връзката за проверка и се върни към `/garden` без запис на URL с токен.",
    "Поискай нова парола от `/auth/help`, потвърди писмото, задай парола и провери, че същата градина остава свързана след връщане в `/garden`.",
    "Влез като smoke потребител и създай първи запис за растение през `/garden`.",
    "За съществуващ профил свържи Google в `/garden`, излез и се върни с Google. Данните и поканата трябва да останат при същия OverGarden user ID.",
    "Добави снимка, обработи я и потвърди, че прочитът показва само URL на публичното почистено производно.",
    "Добави последващ запис към същия обект и потвърди, че няма дублиран обект.",
    "Публикувай първия запис след disclosure и потвърди SSR, noindex, безопасно местоположение и само производни медии в `/journal/[slug]`.",
    "Отвори `/variety/[slug]`, върни се с CTA към `/garden` и запази втори първи запис с атрибуция от публичен сорт.",
    "Отвори noindex `/join`, провери отсъствието от sitemap, премини към `/garden?source=invited-cohort`, запази първи и последващ запис и провери агрегата в `/garden/pilot-health`.",
    "Архивирай публикацията и потвърди HTTP 410 Gone на стария публичен URL.",
    "Отвори `/garden/pilot-health` и потвърди обновяване на H1/H4/H6 без необработени лични данни.",
    "Отвори `/admin` като обикновен Google потребител и потвърди отказ; после влез със специалния owner профил с имейл/парола и потвърди `admin_user_roles`.",
    "Провери `/garden/privacy/erasure-requests` като гост, потребител и owner. Само owner чете ограниченото състояние и изпълнява одобрено изтриване; не записвай ID, имейл, текст, медийни ключове или метаданни.",
    "Провери typeahead или matching service и обработката на `journal_entry_index` / `journal_entry_unindex` с редактирани доказателства от `job_queue` и Meilisearch.",
    "Преди покани потвърди backup/PITR на управлявания Postgres и smoke рестарт на worker със запазен безопасен договор за търсене. Пази само редактирани доказателства.",
  ],
  redactionRules: [
    "Не записвай заглавия или текст от дневника в smoke доказателства.",
    "Не записвай имейли, подписани cookies, токени, API keys, URL на базата или Vercel SSO URL с nonce.",
    "Не записвай quarantine keys, подписани upload URL, ключове на оригинали, EXIF, IP, user-agent, referrer или необработени query strings.",
    "Не записвай точно местоположение. Доказателството може да посочи само скрито или регион.",
  ],
  references: {
    "docs/SDD_VERTICAL_SLICE_ROADMAP.md": "SDD roadmap",
    "docs/PRODUCTION_PILOT_SMOKE.md": "Production smoke на пилота",
    "docs/INFRASTRUCTURE_REGISTRY.md": "Регистър на инфраструктурата",
    "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md":
      "SEO / H6 изследване",
    "docs/product-research/AI_SEO_SYNTHESIS_v0.md":
      "Синтез за AI crawler и WAF",
    "docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md":
      "Контроли за поверителност и изтриване",
  },
};

const RU_COPY: OperatorSmokeCopy = {
  ...UK_COPY,
  metadataTitle: "Проверка пилота | OverGarden",
  title: "Production-проверка пилота",
  description:
    "Операторский контракт готовности и smoke-проверки развёрнутого пути первого пользователя: аутентификация, журнал, производные фото, публичный SSR, архивирование в 410, активация публичного сорта, агрегированное состояние и поиск/worker.",
  readinessStatus: "Состояние готовности",
  generatedDescription:
    "Сформировано {date}. Ручные проверки ожидаемы: эта страница — smoke-контракт, а не замена реального прохождения в браузере по развёрнутому URL.",
  overall: {
    ready: "готово",
    degraded: "частично готово",
    blocked: "заблокировано",
  },
  severities: {
    pass: "пройдено",
    warn: "внимание",
    fail: "ошибка",
    manual: "вручную",
  },
  severitySummaries: {
    pass: "Автоматическая проверка пройдена.",
    warn: "Проверка выявила условие для просмотра до запуска.",
    fail: "Проверка выявила блокер запуска.",
    manual:
      "Этот пункт требует ручного подтверждения с отредактированным доказательством.",
  },
  diagnosticCheck: "Диагностическая проверка",
  literalEvidence: "Буквальное диагностическое доказательство",
  sections: {
    deployment: "Развёртывание и публичный доступ",
    "auth-data-media": "Аутентификация, данные и медиа",
    "public-surfaces": "Публичный SSR, удаление и активация",
    "search-worker-health": "Состояние поиска и worker",
    "durability-recovery": "Резервные копии и восстановление worker",
  },
  checkLabels: {
    "deployment-public-access": "Публичный доступ без аутентификации",
    "cloudflare-html-cache": "Кеш HTML в Cloudflare",
    "media-derivative-readback": "Чтение только производных медиа",
    "public-entry-ssr": "SSR публичного журнала",
    "archive-410": "Архивирование в 410",
    "public-variety-activation": "Активация публичного сорта",
    "invited-cohort-loop": "Цикл приглашённой когорты",
    "journal-search-worker": "Задачи worker поиска журналов",
    "database-backup-pitr": "Резервные копии и PITR управляемого Postgres",
    "worker-process-manager": "Менеджер процессов worker / Meili",
    "worker-restart-recovery": "Перезапуск и восстановление worker",
    "database-config": "Runtime и прямые URL Postgres",
    "vercel-runtime": "Runtime Vercel",
    "r2-config": "Buckets Cloudflare R2 и публичный базовый URL",
    "admin-role-access-model": "Модель доступа административных ролей",
    "erasure-operator-boundary": "Операторская граница удаления",
    "pilot-invite-signing-secret": "Secret подписи пилотного приглашения",
    "better-auth-secret": "Secret Better Auth",
    "resend-auth-email-provider": "Провайдер auth-писем Resend",
    "auth-email-verification-policy": "Политика проверки email",
    "google-oauth-provider": "Провайдер Google OAuth",
  },
  smokeSequence: "Последовательность smoke-проверки",
  redactionRulesTitle: "Правила редактирования доказательств",
  referencesTitle: "Ссылки",
  smokeSteps: [
    "Откройте публичный URL и подтвердите, что `/`, `/health`, `/garden` и `/privacy` возвращают HTML OverGarden, а не вход провайдера.",
    "Запустите Google OAuth из `/garden`, подтвердите точный callback без `redirect_uri_mismatch` или `INVALID_ORIGIN` и возврат на `/garden` без записи auth-параметров.",
    "Создайте профиль с email и паролем, подтвердите письмо от одобренного отправителя, откройте ссылку проверки и вернитесь на `/garden` без записи URL с токеном.",
    "Запросите сброс пароля из `/auth/help`, подтвердите письмо, задайте пароль и проверьте сохранение того же сада после возврата на `/garden`.",
    "Войдите как smoke-пользователь и создайте первую запись о растении через `/garden`.",
    "Для существующего профиля свяжите Google в `/garden`, выйдите и вернитесь через Google. Данные и приглашение должны остаться у того же OverGarden user ID.",
    "Добавьте фото, обработайте его и подтвердите, что чтение показывает только URL публичной очищенной производной.",
    "Добавьте повторную запись к тому же объекту и подтвердите отсутствие дубликата.",
    "Опубликуйте первую запись после disclosure и подтвердите SSR, noindex, безопасное место и только производные медиа в `/journal/[slug]`.",
    "Откройте `/variety/[slug]`, вернитесь CTA в `/garden` и сохраните второй первый путь с атрибуцией публичного сорта.",
    "Откройте noindex `/join`, проверьте отсутствие в sitemap, перейдите в `/garden?source=invited-cohort`, сохраните первую и повторную записи и проверьте агрегат в `/garden/pilot-health`.",
    "Архивируйте публикацию и подтвердите HTTP 410 Gone по старому публичному URL.",
    "Откройте `/garden/pilot-health` и подтвердите обновление H1/H4/H6 без необработанных личных данных.",
    "Откройте `/admin` как обычный Google-пользователь и подтвердите отказ; затем войдите специальным owner-профилем с email/паролем и подтвердите `admin_user_roles`.",
    "Проверьте `/garden/privacy/erasure-requests` как гость, пользователь и owner. Только owner читает ограниченное состояние и выполняет одобренное удаление; не записывайте ID, email, текст, ключи медиа или метаданные.",
    "Проверьте typeahead или matching service и обработку `journal_entry_index` / `journal_entry_unindex` с отредактированными доказательствами `job_queue` и Meilisearch.",
    "До приглашений подтвердите backup/PITR управляемого Postgres и smoke перезапуска worker с сохранением безопасного контракта поиска. Храните только отредактированные доказательства.",
  ],
  redactionRules: [
    "Не записывайте заголовки или текст журнала в smoke-доказательства.",
    "Не записывайте email, подписанные cookies, токены, API keys, URL базы или Vercel SSO URL с nonce.",
    "Не записывайте quarantine keys, подписанные upload URL, ключи оригиналов, EXIF, IP, user-agent, referrer или необработанные query strings.",
    "Не записывайте точное местоположение. Доказательство может указывать только скрытое место или регион.",
  ],
  references: {
    "docs/SDD_VERTICAL_SLICE_ROADMAP.md": "SDD roadmap",
    "docs/PRODUCTION_PILOT_SMOKE.md": "Production smoke пилота",
    "docs/INFRASTRUCTURE_REGISTRY.md": "Реестр инфраструктуры",
    "docs/product-research/B5_SEO_CONTENT_ARCHITECTURE_v2.md":
      "Исследование SEO / H6",
    "docs/product-research/AI_SEO_SYNTHESIS_v0.md": "Синтез AI crawler и WAF",
    "docs/product-research/CROSS_USER_TRUST_AND_PRIVACY_SPEC_v0.md":
      "Контроль приватности и удаления",
  },
};

const COPY_BY_LOCALE = {
  uk: UK_COPY,
  bg: BG_COPY,
  ru: RU_COPY,
} satisfies Record<InterfaceLocale, OperatorSmokeCopy>;

export function getOperatorSmokeCopy(
  locale: InterfaceLocale,
): OperatorSmokeCopy {
  return COPY_BY_LOCALE[locale];
}

export function operatorSmokeCheckLabel(locale: InterfaceLocale, id: string) {
  const copy = getOperatorSmokeCopy(locale);
  const labels = copy.checkLabels as Record<string, string>;
  return labels[id] ?? `${copy.diagnosticCheck}: ${id}`;
}
