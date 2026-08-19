# OverGarden — Реорганізація агентського керування

> Рекомендації за результатами аудиту відповідності стандарту **Agent Plugins v1.0.0**
> (https://agent-plugins.org/)

**Дата:** 2026-08-15
**Стан репозиторію:** гілка `codex/ove-184-moderated-community-revalidation`, коміт `c23bcb02a`
**Статус документа:** рекомендації до виконання; не є чинним контрактом, доки не внесено в `AGENTS.md`

---

## Зміст

1. [Резюме для ухвалення рішення](#1-резюме-для-ухвалення-рішення)
2. [Що встановив аудит](#2-що-встановив-аудит)
3. [Три дефекти](#3-три-дефекти)
4. [Кореневий діагноз: документи без типізації](#4-кореневий-діагноз-документи-без-типізації)
5. [Цільова архітектура](#5-цільова-архітектура)
6. [Класифікація всіх 52 інженерних документів](#6-класифікація-всіх-52-інженерних-документів)
7. [Стандарт авторства скіла](#7-стандарт-авторства-скіла)
8. [Пакування за Agent Plugins](#8-пакування-за-agent-plugins)
9. [Стратегія трьох клієнтів](#9-стратегія-трьох-клієнтів)
10. [План міграції](#10-план-міграції)
11. [Захист від регресу: CI-гейти](#11-захист-від-регресу-ci-гейти)
12. [Чого робити не треба](#12-чого-робити-не-треба)
13. [Додаток: відтворення вимірів](#додаток-відтворення-вимірів)

---

## 1. Резюме для ухвалення рішення

**Відповідність продуктової архітектури стандарту Agent Plugins — питання без предмета.** Стандарт визначає формат пакування агентських компонентів (Skills + MCP-сервери) для дистрибуції. Він не описує архітектуру застосунків. `apps/web`, `services/matching`, `infra`, `contracts` поза його юрисдикцією повністю.

Аудит натомість виявив три реальні дефекти в агентській поверхні репозиторію. Головний із них — **той самий механізм, через який агенти відбудовують видалені підсистеми**, і його треба усунути **до** робіт з видалення офлайну та fail-closed, інакше ті роботи будуть відкочені.

**Одна цифра, яка визначає пріоритет:**

> `docs/product-research/` — **93 файли, 29 542 рядки** — це **68% усієї документації** репозиторію. Це бізнес-дослідження, GTM, OSINT-досьє, бізнес-план та інтерв'ю. `AGENTS.md` явно запрошує агентів у цю директорію рядком *«Product-thinking research lives in `docs/product-research/`»*.

Кодувальний агент не має жодної причини читати 29 тисяч рядків маркетингових досліджень. Але зараз ніщо в структурі не повідомляє йому про це.

**Рекомендований порядок:**

| # | Дія | Зусилля | Ефект |
|---|---|---|---|
| 0 | Розділити `docs/` за типом документа | ~2 год | усуває 68% нерелевантного контексту |
| 1 | Повернути конфіг агентів у git | ~1 год | відтворюваність поведінки |
| 2 | Конвертувати обов'язкові контракти у скіли | ~2 дні | дисципліна завантаження |
| 3 | Спакувати як Agent Plugin | ~3 год | портативність між 3 клієнтами |
| 4 | CI-гейти проти регресу | ~4 год | утримання результату |

---

## 2. Що встановив аудит

### Специфікація Agent Plugins v1.0.0

Стандарт визначає себе як *«відкритий, вендор-нейтральний стандарт для пакування перевикористовуваних компонентів у портативні плагіни»*. Керівний комітет: Amazon, Cursor, Microsoft, OpenAI, Vercel.

Специфіковані артефакти:

| Артефакт | Зміст |
|---|---|
| `plugin.json` | обов'язково `$schema` + `name`; опційно `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `extensions` |
| `skills/` | нерекурсивно; кожна безпосередня піддиректорія з `SKILL.md` = один скіл |
| `mcp.json` | `mcpServers`, закритий union транспортів `stdio` / `streamable-http` / `sse` |
| `com.example.client/` | reverse-domain namespace для клієнт-специфічних розширень |
| `${PLUGIN_ROOT}`, `${PLUGIN_DATA}` | єдині дозволені плейсхолдери; розкриваються в `args`, `env`, `cwd` |

Модель стійкості завантаження: відсутні компоненти, непідтримувані типи та збої окремих компонентів **не фатальні**. Лише порушення схеми в самому `plugin.json` блокує плагін.

### Стан агентської поверхні OverGarden

```
.agents/skills/            5 скілів (resend/resend-skills), SKILL.md + references/ у кожному
skills-lock.json           власний формат: version 1, github source + computedHash
AGENTS.md                  102 рядки; посилається на 15 обов'язкових документів
CLAUDE.md                  вказівник на AGENTS.md
.claude/settings.local.json
.cursor/settings.json
.codex/linear-drafts
.superpowers/
docs/                      172 файли, 43 443 рядки
```

`plugin.json` — відсутній. `mcp.json` — відсутній.

### Формальна відповідність

| Вимога специфікації | Стан | Оцінка |
|---|---|---|
| `plugin.json` у корені пакета | немає | не пакет — тека зі скілами |
| `skills/` з `SKILL.md` на скіл | `.agents/skills/` **структурно збігається** | de facto відповідає |
| Frontmatter (`name`, `description`, `license`) | коректний у всіх 5 | відповідає |
| `references/` (progressive disclosure) | присутні | відповідає |
| `mcp.json` | немає | MCP на рівні клієнта |
| Reverse-domain namespaces | не використовуються | застосовні лише **всередині** плагіна |

**Висновок:** `.agents/skills/` уже майже валідний плагін — бракує одного `plugin.json`. Але сенс у пакуванні з'явиться лише тоді, коли всередині буде **ваш** зміст, а не лише вендорені скіли Resend.

---

## 3. Три дефекти

### Дефект 1 — конфігурація агентів поза git

```
TRACKED     AGENTS.md
TRACKED     CLAUDE.md
TRACKED     skills-lock.json
UNTRACKED   .claude/settings.local.json
UNTRACKED   .cursor/settings.json        (.gitignore:58)
UNTRACKED   .codex/linear-drafts
UNTRACKED   .superpowers/
```

**Наслідок.** Дозволи Bash, увімкнені плагіни Cursor, налаштування Codex — локальні й невидимі. Поведінка агента залежить від машини. Для проєкту, зібраного агентами за 465 комітів, це серйозніший дефект, ніж будь-яка невідповідність формату.

**Конкретний приклад ризику.** `.claude/settings.local.json` дозволяє `Bash(git push:*)`, `Bash(gh pr merge:*)`, `Bash(vercel env run:*)`. Це політика з реальними наслідками для продакшену, яка ніде не зафіксована й не рецензується.

### Дефект 2 — 68% документації є нерелевантним шумом для кодувального агента

| Директорія | Файлів | Рядків | Частка | Релевантність для коду |
|---|---:|---:|---:|---|
| `docs/product-research/` | 93 | 29 542 | 68.0% | **нульова** |
| `docs/` (плоский корінь) | 52 | 10 791 | 24.8% | висока, але змішана |
| `docs/superpowers/` | 19 | 2 044 | 4.7% | сесійні артефакти |
| `docs/reviews/` | 1 | 388 | 0.9% | історична |
| `docs/linear/` | 1 | 387 | 0.9% | шаблон |
| `docs/adr/` | 6 | 291 | 0.7% | висока |
| **Разом** | **172** | **43 443** | 100% | |

### Дефект 3 — відсутня дисципліна завантаження

Плоский `docs/` не розрізняє шість принципово різних типів документа. Агент не може відрізнити **обов'язковий інваріант** від **історичної розписки про виконання**. Обидва — просто `.md` у одній теці.

Це і є механізм, який я задокументував у попередніх аудитах: агент читає `docs/SCAFFOLD_STATUS.md`, бачить *«future slices must extend it rather than create a second logout flow»*, і відбудовує видалений координатор виходу.

---

## 4. Кореневий діагноз: документи без типізації

Це центральна теза документа.

У `docs/` співіснують **шість типів документів із протилежними правилами використання**:

| Тип | Що це | Коли агент має читати | Життєвий цикл |
|---|---|---|---|
| **A. Контракт** | інваріант, який не можна порушити | завжди, коли торкається області | живий, рецензований |
| **B. Реєстр** | поточні факти (інфра, стан гілок) | коли потрібен факт | часто змінюється |
| **C. Рунбук** | процедура на випадок події | лише під час події | живий |
| **D. Розписка** | доказ, що щось було виконано | **ніколи** під час розробки | write-once |
| **E. План** | що робимо далі | на початку задачі | змінюється |
| **F. Дослідження** | бізнес-контекст | **ніколи** кодувальним агентом | архів |

Зараз усі шість — сусіди в одній директорії з однаковим розширенням. Формат скілів вирішує це не тим, що він «модніший», а тим, що дає **два механізми, яких у плоского markdown немає**:

1. **Поле `description` у frontmatter** — декларує, **коли** документ релевантний. Агент читає лише опис, а не весь документ, і сам вирішує, чи завантажувати.
2. **`references/`** — тіло виноситься за межі того, що завантажується завжди.

Ось як це виглядає у вендореному скілі Resend, який уже лежить у вашому репозиторії:

```yaml
---
name: resend
description: Use when working with the Resend email API — sending transactional
  emails (single or batch), receiving inbound emails via webhooks... Always use
  this skill when the user mentions Resend, even for simple tasks — the skill
  contains critical gotchas (idempotency keys, webhook verification) that
  prevent common production issues.
license: MIT
metadata:
  author: resend
  version: "3.5.0"
---
```

`description` тут — не анотація для людини. Це **умова активації**.

---

## 5. Цільова архітектура

```
AGENTS.md                       ← вхідна точка, ≤120 рядків, вендор-нейтральна
CLAUDE.md                       ← вказівник (лишається)

tooling/overgarden-plugin/      ← пакет за Agent Plugins v1.0.0
├── plugin.json
├── skills/
│   ├── stack-invariants/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── privacy-firewall/
│   ├── seo-aeo-surface/
│   ├── media-lifecycle/
│   ├── localization-contract/
│   ├── typography-contract/
│   ├── task-standard/
│   ├── container-runtime/
│   └── production-runbooks/
│       ├── SKILL.md
│       ├── references/
│       └── scripts/
└── com.anthropic.claude-code/  ← клієнт-специфічне, якщо знадобиться

docs/
├── registries/                 ← тип B: живі факти
│   ├── INFRASTRUCTURE_REGISTRY.md
│   ├── MAINLINE_CLOSEOUT.md
│   └── SCAFFOLD_STATUS.md
├── roadmap/                    ← тип E
│   └── SDD_VERTICAL_SLICE_ROADMAP.md
├── adr/                        ← лишається
└── archive/                    ← типи D і F, .aiexclude
    ├── evidence/               ← розписки про виконання
    ├── slices/                 ← специфікації відвантажених слайсів
    └── product-research/       ← 29 542 рядки, поза досяжністю агента
```

**Принцип розділення:** те, що агент **мусить виконувати**, стає скілом. Те, що агент **може знадобитися прочитати**, лишається документом. Те, що агент **не повинен читати ніколи**, йде в архів із маркером виключення.

---

## 6. Класифікація всіх 52 інженерних документів

Це робоча таблиця міграції. Рядки — реальні файли з реальними розмірами.

### A. Контракти → скіли

| Документ | Рядків | Цільовий скіл |
|---|---:|---|
| `TECH_STACK_DECISIONS.md` | 92 | `stack-invariants` |
| `PRECISE_LOCATION_TEXT_FIREWALL.md` | 136 | `privacy-firewall` ⚠️ |
| `PUBLIC_PROJECTION_REVOCATION.md` | 143 | `privacy-firewall` |
| `PUBLIC_SEO_AEO_SURFACE_POLICY.md` | 81 | `seo-aeo-surface` |
| `MEDIA_LIFECYCLE.md` | 72 | `media-lifecycle` ⚠️ |
| `SUBJECT_AWARE_MEDIA.md` | 48 | `media-lifecycle` |
| `INTERFACE_LOCALE_CONTRACT.md` | 315 | `localization-contract` |
| `TYPOGRAPHY_CONTRACT.md` | 668 | `typography-contract` |
| `IDENTITY_POLICY.md` | 240 | `identity-policy` |
| `LINEAR_AI_EXECUTION_TASK_STANDARD.md` | 812 | `task-standard` |
| `CONTAINER_RUNTIME_POLICY.md` | 101 | `container-runtime` |
| `WALKING_SKELETON.md` | 111 | `stack-invariants` |
| `VISUAL_FIXTURE_ENVIRONMENT.md` | 577 | `visual-fixtures` |
| `PUBLIC_INTERACTION_ADMISSION.md` | 53 | `public-surface` |
| `PUBLIC_JOURNAL_SEARCH_BUDGET.md` | 51 | `public-surface` |
| `BOUNDED_PUBLIC_COMMUNITY_SEARCH.md` | 35 | `public-surface` |

⚠️ **Позначені документи підлягають перегляду або видаленню** згідно з новими вимогами (скасування обробки локації та PII). Не конвертуйте їх у скіли до того, як ухвалите рішення — інакше зафіксуєте в новому форматі правило, яке збираєтесь скасувати.

### B. Реєстри → `docs/registries/` (не скіли)

| Документ | Рядків | Причина |
|---|---:|---|
| `INFRASTRUCTURE_REGISTRY.md` | 718 | факти, змінюються поза кодом |
| `SCAFFOLD_STATUS.md` | 473 | стан, а не правило |
| `MAINLINE_CLOSEOUT.md` | 219 | журнал |
| `LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md` | 219 | зріз на дату |
| `MVP_LEARNING_SIGNALS.md` | 74 | метрики |

### C. Рунбуки → скіл `production-runbooks`

| Документ | Рядків |
|---|---:|
| `PRODUCTION_PILOT_SMOKE.md` | 1 294 |
| `LOCAL_MEDIA_RUNTIME_RECOVERY.md` | 185 |
| `PUBLIC_IDENTITY_MIGRATION_RUNBOOK.md` | 164 |
| `DOMAIN_REPUTATION_INCIDENT_RUNBOOK.md` | 120 |
| `QUEUE_RECOVERY.md` | 51 |
| `MANAGED_RECOVERY_DRILL.md` | 46 |

Один `SKILL.md` (≤80 рядків) з маршрутизацією за симптомом → кожен рунбук у `references/`.

### D. Розписки → `docs/archive/evidence/`

`CATALOG_SEED_ROLLOUT_PROOF` (236) · `CATALOG_FULL_IMPORT_DRY_RUN` (198) · `DRIVE2_PARITY_PRODUCTION_CLOSEOUT` (175) · `DETERMINISTIC_MATCHING_ROLLOUT_PROOF` (146) · `PUBLIC_JOURNAL_INDEX_PARITY` (114) · `OBJECT_KIND_MIGRATION_EVIDENCE` (74) · `CATALOG_ENTITY_RESOLUTION_QA` (54) · `launch-corpus-unsplash-license-receipt` (30)

**≈1 027 рядків, які агент не повинен читати ніколи.**

### E. Рішення й плани → `docs/roadmap/`

`SDD_VERTICAL_SLICE_ROADMAP` (913) · `MVP_SCOPE_RECHECK_2026-07-03` (105) · `LINEAGE_SCOPE_DECISION` (111) · `OBJECT_CATEGORY_MODEL_2026-07-23` (41)

### F. Специфікації відвантажених слайсів → `docs/archive/slices/`

`CATALOG_MATCH_SUGGESTION_QUEUE` (175) · `CATALOG_ALIAS_SUGGESTION_REVIEW` (129) · `CATALOG_GARDENER_TYPEAHEAD_READBACK` (120) · `ADMIN_ROLE_BOOTSTRAP` (111) · `META_ADS_ATTRIBUTION_READINESS` (107) · `STRUCTURED_JOURNAL_COMPOSER` (103) · `STRUCTURED_JOURNAL_BLOCK_REORDER` (59) · `STRUCTURED_JOURNAL_COVER` (47) · `LAUNCH_CORPUS` (191) · `LOCALIZATION_COVERAGE_WORKFLOW` (218) · `FOUNDER_INTERVIEW_CAPTURE` (60)

### G. Підлягають видаленню за новими вимогами

| Документ | Рядків | Підстава |
|---|---:|---|
| `MVP_PRIVACY_RETENTION_POLICY.md` | 102 | скасування обробки PII |
| `CURRENT_SCHEMA_ERASURE.md` | 74 | те саме |
| розділи OVE-204 у `PRODUCTION_PILOT_SMOKE.md` | ~55 | скасування fail-closed |
| офлайн-розділи в `TECH_STACK_DECISIONS.md` §2.8 | ~17 | скасування офлайну |

---

## 7. Стандарт авторства скіла

Пропоную зафіксувати як обов'язковий контракт.

### Бюджет розміру

| Рівень | Ліміт | Завантажується |
|---|---|---|
| `description` у frontmatter | ≤500 символів | завжди |
| `SKILL.md` | **≤150 рядків** | коли `description` збігся |
| `references/*.md` | без ліміту | лише за явним посиланням |
| `scripts/` | — | виконуються, не читаються |

Якщо `SKILL.md` перевищує 150 рядків — це ознака, що документ не декомпозовано.

### Правила для `description`

Це поле — умова активації, а не анотація. Воно має містити:

1. **Тригер** — за яких обставин скіл релевантний;
2. **Область** — яких файлів/директорій стосується;
3. **Наслідок ігнорування** — що зламається (це різко підвищує точність активації).

**Погано:**
```yaml
description: Правила приватності локації.
```

**Добре:**
```yaml
description: Використовуй ЗАВЖДИ при роботі з координатами, геоданими,
  EXIF, полями локації в БД, публічними проєкціями або Meilisearch-документами.
  Область — apps/web/src/lib/privacy/, server/, services/matching/.
  Ігнорування призводить до витоку точних координат користувачів у публічні
  поверхні, що є безпековим інцидентом для аудиторії під воєнним ризиком.
```

### Шаблон `SKILL.md`

```markdown
---
name: privacy-firewall
description: <тригер + область + наслідок>
license: UNLICENSED
metadata:
  owner: yehor-design
  authority: binding
  supersedes: docs/PRECISE_LOCATION_TEXT_FIREWALL.md
  linear: OVE-234
---

# Privacy firewall

## Інваріант
<2–4 речення. Що заборонено абсолютно.>

## Авторитетна реалізація
`apps/web/src/lib/privacy/precise-location-text.ts` — єдиний детектор.
Ніколи не додавай локальний regex для координат.

## Перевірка перед комітом
```bash
pnpm privacy:location:audit
```

## Поглиблено
- Дозволені винятки для зовнішніх каталогів → `references/catalog-ingestion.md`
- Дзеркало на Python → `references/python-mirror.md`
```

### Поле `authority` — критичне для вашого випадку

Пропоную три значення в `metadata`:

| `authority` | Значення | Наслідок |
|---|---|---|
| `binding` | інваріант; порушення блокує merge | агент не має права обійти |
| `advisory` | рекомендація за замовчуванням | можна відхилитись із обґрунтуванням |
| `historical` | зафіксовано для контексту | **не є вказівкою до дії** |

Саме відсутність цієї позначки спричинила відкат видалення координатора виходу: `SCAFFOLD_STATUS.md` описував стан на момент написання, але агент прочитав його як чинний припис.

---

## 8. Пакування за Agent Plugins

### `plugin.json`

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "overgarden-engineering",
  "version": "1.0.0",
  "description": "Binding engineering contracts, runbooks and task standards for the OverGarden repository",
  "author": { "name": "yehor-design" },
  "repository": "https://github.com/yehor-design/over.garden",
  "license": "UNLICENSED",
  "keywords": ["overgarden", "nextjs", "postgres", "privacy", "seo"]
}
```

Обов'язкові поля за специфікацією — лише `$schema` і `name`. Решта — метадані, які роблять пакет самоописовим.

**Правила імені** (зі специфікації): 1–64 символи, малі літери/цифри/дефіси/крапки, без провідних і кінцевих дефісів, без послідовних `--` або `..`.

### `mcp.json` — поки не потрібен

У вас немає власних MCP-серверів. Специфікація прямо каже: **відсутній `mcp.json` не є помилкою**. Не створюйте порожній файл.

### Розміщення

Рекомендую `tooling/overgarden-plugin/`, а не корінь репозиторію. Причини:

- плагін — це окрема одиниця з власним версіонуванням;
- корінь уже перевантажений (`.agents`, `.claude`, `.codex`, `.cursor`, `.superpowers`);
- у майбутньому поруч може стати другий пакет (наприклад, публічний каталожний MCP).

---

## 9. Стратегія трьох клієнтів

Ви демонстровано працюєте з **Claude Code, Cursor і Codex**. Це рівно той сценарій фрагментації, заради якого стандарт створено.

### Розподіл відповідальності

| Шар | Місце | Портативність |
|---|---|---|
| Інструкції репозиторію | `AGENTS.md` | стандарт agents.md — усі три клієнти |
| Контракти й процедури | `tooling/overgarden-plugin/skills/` | Agent Plugins — вендор-нейтрально |
| Клієнт-специфічні хуки | `com.<vendor>.<client>/` усередині плагіна | ізольовано |
| Дозволи та політики | `.claude/settings.json` (**у git**) | клієнт-специфічно, але рецензовано |
| Особисті налаштування | `.claude/settings.local.json` (ignored) | локально |

### Виправлення `.gitignore`

Зараз рядок 58 ігнорує `.cursor/` цілком, через що спільні налаштування плагінів Vercel і Linear губляться. Замініть на вибіркове ігнорування:

```gitignore
# Особисте — не в git
.claude/settings.local.json
.cursor/settings.local.json
.codex/linear-drafts/
.superpowers/

# Командне — у git:
# .claude/settings.json
# .cursor/settings.json
```

### `AGENTS.md` лишається вхідною точкою

Не переносьте його вміст у скіли. Це різні механізми:

- `AGENTS.md` — **завжди в контексті**, тому має бути коротким (зараз 102 рядки — прийнятно);
- скіли — **умовно завантажувані**, тому можуть бути детальними.

Після міграції `AGENTS.md` має містити: опис проєкту, поточний стек, посилання на плагін і 5–7 найтвердіших правил. Усі 15 нинішніх посилань на `docs/*.md` замінюються на посилання на скіли.

**Обов'язково видаліть рядок**, який запрошує агентів у `docs/product-research/`.

---

## 10. План міграції

### Крок 0 — розділення `docs/` за типом (~2 год) 🔴 найвищий пріоритет

```bash
mkdir -p docs/registries docs/roadmap docs/archive/{evidence,slices,product-research}
git mv docs/product-research/* docs/archive/product-research/
# далі за таблицею §6
```

Додайте `docs/archive/.aiexclude` (або еквівалент для ваших клієнтів) і згадайте виключення в `AGENTS.md` явно.

**Чому крок 0, а не крок 3:** ефект негайний і не потребує жодної конвертації. 29 542 рядки перестають бути досяжними одним рухом.

### Крок 1 — конфігурація в git (~1 год)

Розділити `.claude/settings.json` / `settings.local.json`, зняти повне ігнорування `.cursor/`, зафіксувати політику дозволів як рецензований артефакт.

### Крок 2 — три пілотні скіли (~4 год)

Не конвертуйте все одразу. Візьміть три з різними профілями, щоб перевірити стандарт:

| Скіл | Джерело | Профіль перевірки |
|---|---|---|
| `container-runtime` | `CONTAINER_RUNTIME_POLICY.md` (101) | малий, вузький тригер |
| `task-standard` | `LINEAR_AI_EXECUTION_TASK_STANDARD.md` (812) | великий, потребує `references/` |
| `production-runbooks` | 6 рунбуків (1 860) | агрегація багатьох документів |

Критерій успіху: у трьох клієнтах агент завантажує скіл тоді і лише тоді, коли задача справді його стосується.

### Крок 3 — пакування (~3 год)

`plugin.json`, перенесення `.agents/skills/` вендорених скілів усередину `skills/`, оновлення `skills-lock.json` на новий шлях.

### Крок 4 — решта контрактів (~1.5 дня)

За таблицею §6, **окрім** позначених ⚠️ — їх конвертуйте лише після ухвалення рішення щодо скасування приватності локації.

### Крок 5 — CI-гейти (~4 год)

Див. §11.

### Порядок відносно робіт з видалення офлайну та fail-closed

```
Крок 0 → Крок 1 → Крок 2 → Крок 3 → Крок 4
                                        │
                                        ▼
                       ТІЛЬКИ ТЕПЕР: видалення офлайну,
                       fail-closed, PII-пайплайну
```

**Це не побажання, а умова.** Поки `docs/SCAFFOLD_STATUS.md` і `docs/SDD_VERTICAL_SLICE_ROADMAP.md:97` містять приписи «розширювати координатор, а не форкати», будь-яке видалення буде відкочене наступним агентом із посиланням на ці рядки.

---

## 11. Захист від регресу: CI-гейти

Без автоматичних перевірок структура деградує за кілька тижнів.

### Гейт 1 — бюджет розміру скіла

```bash
# провалюється, якщо SKILL.md > 150 рядків
find tooling/overgarden-plugin/skills -name SKILL.md \
  -exec awk 'END{if(NR>150) {print FILENAME": "NR" рядків (ліміт 150)"; exit 1}}' {} \;
```

### Гейт 2 — валідність `plugin.json` за канонічною схемою

Схема опублікована за `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. Валідуйте в CI будь-яким JSON-Schema валідатором.

### Гейт 3 — обов'язковий frontmatter

Кожен `SKILL.md` мусить мати `name`, `description` і `metadata.authority` з одного з трьох дозволених значень.

### Гейт 4 — заборона посилань на архів

```bash
# AGENTS.md і скіли не мають права посилатися на docs/archive/
grep -rn "docs/archive/" AGENTS.md tooling/overgarden-plugin/ && exit 1
```

### Гейт 5 — жодного нового плоского документа в `docs/`

Новий `.md` у корені `docs/` без класифікації в одну з піддиректорій — провал збірки. Це те, що утримує результат у часі.

---

## 12. Чого робити не треба

| Не робіть | Причина |
|---|---|
| Не реструктуруйте `apps/`, `services/`, `contracts/`, `infra/` | поза юрисдикцією стандарту; нульова користь |
| Не створюйте `plugin.json` для продукту | OverGarden не плагін |
| Не замінюйте `skills-lock.json` | стандарт не має поняття lockfile; ваш формат розв'язує задачу, якої специфікація не розв'язує |
| Не викидайте `AGENTS.md` | правильний вендор-нейтральний стандарт, ортогональний до Agent Plugins |
| Не створюйте порожній `mcp.json` | специфікація: відсутність — не помилка |
| Не конвертуйте `docs/product-research/` у скіли | це архів, а не інструкції |
| Не конвертуйте документи, позначені ⚠️, до рішення щодо приватності | зафіксуєте правило, яке скасовуєте |

---

## Майбутня можливість: MCP-сервер каталогу

Єдине місце, де Agent Plugins торкається **продукту**, а не тулінгу — і воно прямо працює на вашу вимогу AEO.

`mcp.json` зі `streamable-http` сервером, який експонує каталог сортів UA/BG, робить OverGarden джерелом даних безпосередньо для агентських клієнтів. Це канал дистрибуції у відповідні рушії, який не залежить від індексації.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "overgarden-catalog": {
      "type": "streamable-http",
      "url": "https://mcp.over.garden/catalog"
    }
  }
}
```

Не MVP. Але це справжня, а не карго-культова точка застосування стандарту — і її варто врахувати, коли проєктуватимете публічний каталожний API.

---

## Підсумок

Стандарт Agent Plugins до архітектури продукту не застосовний, і приводити її «у відповідність» не треба.

Аудит натомість показав, що агентська поверхня репозиторію має три дефекти, з яких **другий — недиференційовані 43 тисячі рядків документації — є коренем проблеми, що вже коштувала вам відкоченої роботи**.

Найбільший ефект за найменших зусиль дає **Крок 0**: розділити `docs/` за типом документа. Дві години роботи прибирають 68% нерелевантного контексту.

Пакування за Agent Plugins — правильний фінал цієї роботи, бо ви працюєте з трьох клієнтів. Але без Кроків 0, 2 і 4 воно дасть порожню обгортку.

---

## Додаток: відтворення вимірів

```bash
cd /Users/yehor/frontend/over.garden

# розподіл документації за директоріями
for d in product-research adr linear reviews superpowers; do
  printf "%-20s %3s файлів %6s рядків\n" "docs/$d" \
    "$(find docs/$d -name '*.md' | wc -l)" \
    "$(find docs/$d -name '*.md' -exec cat {} + | wc -l)"
done

# плоский корінь docs/, за розміром
find docs -maxdepth 1 -name "*.md" -exec wc -l {} + | sort -rn

# статус відстеження агентських конфігів
for f in AGENTS.md CLAUDE.md skills-lock.json \
         .claude/settings.local.json .cursor/settings.json; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 \
    && echo "TRACKED   $f" || echo "UNTRACKED $f"
done

# обов'язкові документи, на які посилається AGENTS.md
grep -oE "docs/[A-Za-z0-9_/-]+\.md" AGENTS.md | sort -u

# наявність артефактів Agent Plugins
find . -path ./node_modules -prune -o \
  \( -name "plugin.json" -o -name "mcp.json" -o -name "SKILL.md" \) -print
```
