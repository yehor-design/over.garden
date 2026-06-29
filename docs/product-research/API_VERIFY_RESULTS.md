# OverGarden — Результати двох верифікацій джерел (VERIFY_RESULTS)

**Що це:** результат двох точкових перевірок фактом (CHECK-1: машиночитний Держреєстр сортів UA; CHECK-2: україно-/болгаромовні мітки в онтології порід VBO). Кожна виконана окремим саб-агентом; оркестратор відкрив їхні `evidence/`-файли й підтвердив, що вердикти підкріплені артефактами.
**Дата:** 2026-06-06.

**Чи виконувалося реальне завантаження файлів на диск / виконання коду для фетчу? — НІ (чесно).** За політикою середовища отримання URL дозволене лише через керований інструмент `web_fetch` (і браузер для JS-сторінок), а **НЕ** через `curl`/`wget`/`python` у пісочниці. Тому: (1) жоден сирий файл (CSV/XLSX/онтологія) не збережено на хост-комп'ютер — назовні вийшли лише текстові висновки в `evidence/`; (2) глибокий бінарний парсинг (підрахунок рядків CSV, вичерпна енумерація 20k термів OWL) **не виконувався** — `web_fetch` не декодує octet-stream і обрізає великі файли. Де цей парсинг був потрібен — вердикт чесно знижено до PARTIAL, без вигаданого PASS. Браузерний фолбек (Claude-in-Chrome) був завантажений, але **жоден браузер не під'єднаний** → JS-сторінки/бінарні файли не рендерилися.

**Статус:** CHECK-1 = **PARTIAL** · CHECK-2 = **FAIL** (для питання uk/bg) з нотою «придатний як кістяк».

---

## CHECK-1 — Держреєстр сортів рослин України (машиночитний + актуальний + ліцензія)

### ВЕРДИКТ: PARTIAL
**Чому не PASS:** усі ознаки машиночитного CC-BY-датасету підтверджені (ресурси, схема полів, ліцензія, дата) — **АЛЕ сирі рядки CSV не вдалося декодувати** наявними дозволеними інструментами (файли віддаються як `application/octet-stream`, головний реєстровий CSV повернув порожнє тіло як завеликий, datastore-API порожній через Cloudflare). Тобто «містить записи сортів» підтверджено зі **схеми** (datapackage), а не з **спостережених рядків**. **Чому не FAIL:** претензія оспорювача («лише PDF-накази + точковий пошук») **спростована фактом** — реальні CSV-ресурси існують, віддаються (HTTP 200), задекларовані `text/csv` + `utf-8`, датовані 2025-07-15, зі схемою очікуваних полів.

**Перелік ресурсів** (з HTML-сторінки датасета + datapackage JSON; усі URL під `data.gov.ua/dataset/eabd0bd2-.../resource/.../download/...`):

- `2025-07-15_RegisterVarietis.csv` — **головний реєстр сортів** — формат CSV, `text/csv`, `utf-8`; дата «на 15.07.2025»; розмір на сторінці не вказано.
- `2025-07-15_VarietisOwners.csv` — власники — CSV/utf-8; 15.07.2025. **(ресурс власників — Є.)**
- `2025-07-15_VarietisMaintainers.csv` — підтримувачі — CSV/utf-8; 15.07.2025. **(ресурс підтримувачів — Є.)**
- `StructureRegisterVarietis.csv` — опис структури; на сторінці позначено «CSV», але завантажується як `.xlsx` (розбіжність розширення); 23.08.2024.
- `StructureVarietisOwners.csv`, `StructureVarietisMaintainers.csv` — описи структури (data-dictionary).
- `Опис.txt` — readme, `text/plain`, utf-8.
- Метадані: `/passport_csv`, `/datapackage`.

**Заголовки колонок головного реєстру** (verbatim зі схеми `datapackage` — НЕ з прочитаного рядка CSV; 20 полів):

```
taxonName · сountryCode · groupRipeness · varietyNameLan · plantPatent · dateApplication ·
applicationNumber · varietyName · varietyNameTRL · taxonGroupName · proposedZone ·
taxonGroupNameEn · publicDomain · taxonNameLat · startDateRegistration · directionUse ·
quality · creationMethod · сountryCodeApplicant · taxonNameEn
```

**Очікувані поля — ПІДТВЕРДЖЕНО (у схемі):** `varietyName` (кирилична назва, поз. 8), `varietyNameLan` (латиниця, поз. 4), `varietyNameTRL` (транслітерація, поз. 9). Усі три присутні. Ресурси `VarietisOwners` і `VarietisMaintainers` існують. (Дрібниця: деякі поля мають провідну кириличну «с» — `сountryCode` U+0441 — verbatim з джерела.)

**Сирі рядки/Cyrillic у даних:** НЕ спостережено (файл не декодовано). Кирилиця читається у HTML-сторінці й datapackage (UTF-8 коректний), але не підтверджено всередині рядків CSV. **Точна кількість записів:** не отримана (головний CSV + datastore-API порожні через web_fetch).

**Свіжість:** останнє оновлення **2025-07-15** (≈10,7 міс до дати перевірки — у межах ≤12 міс). **Застереження:** портал сам позначає датасет «**Не оновлений / Not updated**», а задекларована частота «щомісяця» де-факто зупинилася після липня 2025.

**Ліцензія (verbatim + URL):**

```
datapackage "licenses": [ { "path": "http://www.opendefinition.org/licenses/cc-by",
                            "name": "cc-by", "title": "Creative Commons Attribution" } ]
Футер сайту (uk+en): "Весь контент доступний за ліцензією Creative Commons Attribution 4.0
International license, якщо не зазначено інше" → https://creativecommons.org/licenses/by/4.0/
Умова reuse (ЗУ «Про доступ до публічної інформації»): "Будь-яка особа може вільно копіювати,
публікувати, поширювати, використовувати, зокрема в комерційних цілях … з обов'язковим
посиланням на джерело."
```
URL: https://data.gov.ua/dataset/ccf95f4a-8238-4b18-a4d3-002444876325 · доступ 2026-06-06. → **CC-BY підтверджено дослівно** (CC BY 4.0 International на рівні сайту; комерція дозволена з атрибуцією).

**Дзеркало minagro:** `https://minagro.gov.ua/file-storage/reyestr-sortiv-roslin` — **НЕ перевірено** (JS-рендер, порожня оболонка через web_fetch; браузер не під'єднаний).

**robots.txt (важлива нота про техніку≠право):** `data.gov.ua/robots.txt` **прямо забороняє** ClaudeBot/Claude-Web/Anthropic-ai та curl/wget/python-requests/Scrapy (`Disallow: /`) і `/api/` для всіх ботів. Тобто **сайтова політика забороняє автоматичний краулінг**, хоча **самі дані під CC-BY** (ліцензія дозволяє повторне використання). Для інтеграції — завантажувати файл легально (раз, не краулити) або через офіційний канал.

**Артефакти:** `evidence/derzhreyestr_resources.txt`, `evidence/derzhreyestr_sample.txt` (схема+статус, без сирих рядків), `evidence/derzhreyestr_license.txt` (дослівна ліцензія).

**Вплив на рішення:** UA-сорти **= «отримати готове» підтверджено на 90%** (реальний CC-BY CSV зі схемою назв існує й датований 2025) → план «парсити PDF/OCR» НЕ потрібен; лишається останній крок — реально завантажити CSV легальним каналом і **підтвердити рядки + кількість + кирилицю в даних** (web_fetch цього не зміг). Конфлікт синтезу про існування CSV — **закрито на користь «CSV існує»**.

---

## CHECK-2 — VBO: чи є україно-/болгаромовні мітки порід

### ВЕРДИКТ: FAIL (для питання uk/bg) — VBO англомовна. АЛЕ придатна як кістяк, що локалізуємо самі.
**Чому FAIL:** 0 україномовних, 0 болгаромовних міток/синонімів, 0 кирилиці. Первинні мітки 100% англійські; рідні назви присутні лише як **романізовані латиницею** нетеговані синоніми.

**Канонічне джерело + версія + файли:**
- Джерело: OBO Foundry `https://obofoundry.org/ontology/vbo`; репозиторій `https://github.com/monarch-initiative/vertebrate-breed-ontology` (Monarch Initiative).
- **Версія релізу: 2026-04-15** (підтверджено двома артефактами: OLS4 `"version":"2026-04-15"` + заголовок `vbo.obo` `data-version: releases/2026-04-15`).
- Файли: `https://purl.obolibrary.org/obo/vbo.owl` · `vbo.obo` · `vbo.json` (+ `vbo-base.*`).

**Кількості (verbatim, OLS4 API `https://www.ebi.ac.uk/ols4/api/ontologies/vbo`, доступ 2026-06-06):**

```
"languages" : [ "en" ]        <-- ЄДИНА проіндексована мова: англійська
"numberOfTerms" : 20473
"numberOfIndividuals" : 73
"synonymProperties" : [ ]
```
- Всього термів: **20 473** · `uk`-мітки: **0** · `bg`-мітки: **0** · будь-яка кирилиця: **0**.

**Докази (тришарово):**
1. **Авторитетний індикатор:** OLS4 будує масив `languages`, скануючи всі мовно-теговані літерали; знайшов лише `"en"`.
2. **Cyrillic-пошук (OLS4 search API):** `порода` (vbo) = 0; `карпатська` = 0; `родопско` = 0. *Чесне застереження:* `порода` без фільтра по всьому OLS4 = теж 0 → токенізатор OLS може погано індексувати кирилицю, тож ці пошуки — **корроборуючі, не самостійні**; вердикт несуть (1) `languages:["en"]` і (3).
3. **Сирий `vbo.obo`** (через `purl.obolibrary.org/obo/vbo.obo` → raw.githubusercontent): у відданій частині (обрізано до ~82 733 символів = заголовок + імпортований каркас BFO/NCBITaxon; стансі порід `id: VBO:` сортуються після імпортів і не потрапили) — **0 кирилиці**; формат синонімів **без мовних тегів** (`synonym: "..." EXACT [...]`), у заголовку **немає** мовоспецифічних `synonymtypedef`. Обрізання чесно зафіксовано → вичерпну енумерацію не зроблено; вердикт спирається на OLS4 + скан відданої частини.

**Приклади міток (англійські; uk/bg = 0):**
- UA-породи присутні **за англійською назвою** (пошук `Ukrainian` у vbo = **36** збігів): напр. `VBO:0005350 "Ukrainian Grey, Ukraine (Cattle)"`, `VBO:0001207 "Ukrainian (Pig)"`.
- BG-породи (пошук `Bulgarian` = **12** збігів): напр. `VBO:0017634 "Bulgarian Rhodope (Cattle)"`, `VBO:0017442 "East Bulgarian (Horse)"`.
- `Carpathian Goat (Goat)` = `VBO:0000744` (кириличний запит «карпатська» не знайшов; порода існує під англ. назвою).
- **Нюанс:** рідні назви — як романізовані синоніми без тегів, напр. `VBO:0005350` синонім `"Sira Ukrainska"` (= транслітерація «Сіра Українська»), **не кирилиця, не `uk`-тег** → непридатні як локалізовані мітки.

**Покриття видів:** ВРХ, свині, коні, кози (пошук `goat` = 1469), качки/птиця, вівці — **присутні**. **Бджоли / Apis — ВІДСУТНІ** (пошук `honey bee` у vbo = 0): VBO — онтологія **хребетних**, бджоли поза скоупом за визначенням. **Це критично для OverGarden:** провідний клин — бджільництво, а VBO **не покриває бджіл взагалі**.

**Ліцензія (verbatim + URL):**
```
OBO Foundry: License — CC BY 4.0 → https://creativecommons.org/licenses/by/4.0/
vbo.obo header: property_value: terms:license https://creativecommons.org/licenses/by/4.0/
```
URL: https://obofoundry.org/ontology/vbo · доступ 2026-06-06. → **CC BY 4.0 підтверджено дослівно** (дозволяє адаптацію + редистрибуцію з атрибуцією).

**Модель даних / придатність як кістяк:** OBO/OWL; мітка = `rdfs:label`; види через імпорт NCBITaxon; **структурно вирівняно на DAD-IS (FAO)** (subsetdef `local_breed`/`transboundary`/`national_breed_population` з посиланням на DAD-IS); стабільні VBO-ID на породу; синонім-слоти приймають додаткові мітки. Вживається в OMIA, Cellosaurus. → **Придатна як англо/латинський кістяк порід-ХРЕБЕТНИХ, який локалізуємо самі**, але: (а) uk/bg-мітки додаємо власноруч; (б) бджоли не покриті; (в) ~20k термів містять імпортований каркас — підмножину порід треба відфільтрувати.

**Артефакти:** `evidence/vbo_meta.txt` (джерело/версія/файли/ліцензія/лічильники/модель), `evidence/vbo_langtags.txt` (масив `languages` + Cyrillic-пошуки + скан файлу + приклади).

**Вплив на рішення:** VBO **НЕ** беремо як «локалізований посів порід» (uk/bg немає). Шлях: **VBO як CC-BY англо/лат. кістяк ХРЕБЕТНИХ-порід (з ID, DAD-IS-вирівнюванням) + uk/bg-мітки додаємо самі**; для **бджіл VBO не годиться взагалі** → bee-породи лишаються на hardcode малого UA/BG-набору (Закон №1492-III + ИАСРЖ), як у DECISION_BRIEF. Тобто рекомендація «перевірити VBO як семантичне ядро порід» (ВІДКРИТЕ РІШЕННЯ #6 синтезу) уточнюється: VBO корисний для каталогу тварин-хребетних, але не закриває ні локалізацію, ні bee-wedge.

---

## Підсумок (2–3 рядки)

Жодна з двох перевірок не дала чистого PASS, але обидві дали **рішення-релевантний факт**: (1) машиночитний CC-BY Держреєстр сортів UA **демонстровно існує** (ресурси + схема з `varietyName/Lan/TRL` + CC BY 4.0, дата 2025-07-15) — план «парсити PDF» відпадає, лишилось лише фактично зчитати рядки легальним каналом (PARTIAL через обмеження інструмента, не через брак даних); (2) VBO **англомовна** (0 uk, 0 bg, 0 кирилиці) і **без бджіл** — придатна лише як CC-BY кістяк хребетних-порід, який локалізуємо самі, а не як готовий локалізований посів. Для стека це означає: UA-сорти L2 = acquire (підтверджено); породні uk/bg-мітки й bee-wedge = build, як і планувалося.

---

## OVE-55 live source readiness gate — 2026-06-29

OVE-55 supersedes the earlier two-check snapshot for execution planning. The old checks remain useful provenance, but the current go/no-go gate is now:

- Human-readable result: `docs/product-research/CATALOG_SOURCE_READINESS.md`.
- Machine-readable manifest: `docs/product-research/CATALOG_SOURCE_READINESS_MANIFEST.json`.
- Repeatable verifier: `cd apps/web && pnpm catalog:sources:verify`.

The verifier ran live endpoint checks on 2026-06-29 and passed:

- 17 source paths covered.
- `USE`: 8 sources — UA State Register, CoL/ChecklistBank, WFO, GBIF Backbone, EPPO, Wikidata, GRIN, VBO.
- `USE-WITH-CONDITIONS`: 4 sources — IASAS BG, EU Common Catalogue, EOL, iNaturalist.
- `INTERNAL-VALIDATION-ONLY`: 4 sources — PESI/Euro+Med, DAD-IS/EFABIS, EURISCO, Genesys.
- `REJECT`: 1 path — vendor/marketplace bulk ingestion without partner feed, official API contract, or written permission.

Decision impact:

- OVE-56 may build source snapshot quarantine from `USE` sources first.
- OVE-57 may consume the UA State Register. OVE-55 now adds a real byte-range row proof: `2025-07-15_registervarietis.csv` responds with HTTP 206, UTF-16LE bytes, schema fields, and a public official sample row. OVE-57 must therefore handle octet-stream UTF-16LE explicitly and record checksum/row count before canonical projection.
- OVE-58 may consume CoL, WFO, GBIF Backbone, EPPO, GRIN, and Wikidata as bounded species-backbone/support sources.
- OVE-60 may consume VBO for vertebrate breeds only; bee identities remain a small official/manual path. DAD-IS/EFABIS is internal validation only.
- OVE-59, OVE-61, OVE-62, and vendor/marketplace paths must not promote conditional or internal-validation-only data until the specific blockers in the manifest are closed.

Privacy impact:

- External occurrence/distribution coordinates are raw/source-only if a later source license allows capture. They are not OverGarden user/product location data and must not enter product projections, public pages, Meilisearch, analytics, logs, or UI without a later explicit ADR and SDD slice.
