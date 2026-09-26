# Standard species base — proof, 2026-09-26

Status: dated receipt for `OVE-530` (ADR-0035 D3), phase 2. Phase 1 — the
generator and the data file — is PR #475. Nothing here is a secret: counts,
names from the public base, and timings.

## What is live

| Where | State on 2026-09-26 |
| --- | --- |
| Production database | `0081` applied; the base (version `2026-09-26`, 413 rows) loaded; 188 orphan register forms attached |
| Production application | still the build before this change — Vercel has paused the account (`PROJECT_STATE.md`, known gap 12) |
| Repository | the picker offers a species only from the base; the save path refuses any other; the «повний каталог» path is gone |

The picker's answers below were measured by running the picker's own statement
(`buildCatalogTypeaheadStatement`, the one `/api/public/catalog/typeahead`
runs) against the production database in a read-only transaction:
`scripts/probe-standard-species.ts`. The deployed application gives the same
answers once a deployment is possible.

## Coverage

413 rows, no cap: 313 plants and 100 animals.

| Group | Rows | Group | Rows |
| --- | ---: | --- | ---: |
| vegetables | 79 | poultry | 13 |
| herbs | 57 | livestock | 11 |
| flowers | 45 | pets | 14 |
| houseplants | 45 | fish | 33 |
| fruit | 39 | reptiles | 12 |
| trees_shrubs | 22 | birds | 9 |
| field_crops | 17 | other_animals | 6 |
| berries | 9 | bees | 2 |

Inclusion, applied to every candidate alike: every garden-relevant crop of the
UA State Register (its cultivar count is the popularity signal), and any other
candidate with at least 600 (uk), 200 (bg) or 3,000 (ru) Wikipedia pageviews in
the 60 days before 2026-09-26, reached through Wikidata sitelinks only.

Names: uk 153 confirmed by two sources and 260 for the owner's review; ru 196
and 217; bg 211 confirmed by two Bulgarian sources and 202 single-source with an
evidence URL (the owner delegated the Bulgarian names).

## Loading — `scripts/load-standard-species.ts`

One transaction; a dry run unless `--apply`.

| Run | Seconds | By identifier | By name | From Catalogue of Life | Created | Names written | Names changed | Duplicates | Conflicts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dry run 1 | 391 | 327 | 2 | 12 | 72 | 3,713 | 723 | 1 (spelt) | 0 |
| dry run 4, after the fixes below | 394 | 320 | 3 | 20 | 70 | 3,727 | 719 | 0 | 0 |
| **apply** | 389 | 320 | 3 | 20 | 70 | 3,727 | 719 | 0 | 0 |
| re-run of the same file | 18 | 413 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The re-run wrote only the seven genus addresses added after the apply
(`addressesAssigned: 7`); a later dry re-run reported every count zero.

What the dry runs found, and what the loader does since:

- **A folded EPPO code is not an identity.** The catalogue keeps spelt's
  `TRZSP` on bread wheat's node, so spelt resolved onto wheat. An EPPO hit now
  counts only when the node carries the row's own name, or its genus and
  epithet (sweet orange's `CIDSI` sits on «Citrus x aurantium var. sinensis»).
- **A Catalogue of Life synonym leads to its accepted node** (Matricaria
  recutita → Matricaria chamomilla, Lens culinaris → Vicia lens), but only when
  the accepted usage has the row's rank: hot pepper's «Capsicum annuum var.
  acuminatum» is a synonym of the species, and the species is a row of its own.
- **A binomial without the hybrid sign also looks for it**: «Chrysanthemum
  morifolium» is the catalogue's «Chrysanthemum x morifolium».
- **Every member has an address.** Seven genera (Rosa, Lilium, Clematis, Hosta,
  Phalaenopsis, Ancistrus, Corydoras) had none. «rosa» belongs to the cultivar
  «Роса», so roses are `/species/rosa-spp` — the botanist's "any species of the
  genus" — before any numbered suffix. An address once given stays.
- **One primary vernacular per language.** The everyday name becomes the
  primary name in uk, bg and ru; any other primary is demoted and remembers it;
  a name a source import wrote is made heavier, never replaced. Every change is
  recorded in `catalog_standard_species_names` with what it was, so a newer
  file — or the rollback — takes back exactly the base's own changes.

Missing nodes: garden strawberry («Fragaria x ananassa») now has 92 register
cultivars attached (`scripts/attach-register-forms.ts --source all`: 187 UA and
1 EU form attached, and their 188 queue items closed by the next run); roses
hang on Rosa (64 forms).

## The picker, before and after

| Мова | Що | Запит | До (2026-09-26, до завантаження) | Після |
| --- | --- | --- | --- | --- |
| uk | рослина | «помідор» | томат · Аля cultivar ← томат · Пончо cultivar ← томат | Помідор · Аля cultivar ← Помідор · Пончо cultivar ← Помідор |
| uk | рослина | «перець» | Амі cultivar ← стручковий перець однорічний · Ацтек cultivar ← стручковий перець однорічний · Бея cultivar ← стручковий перець однорічний | Перець · Гострий перець · Амі cultivar ← Перець |
| uk | рослина | «болгарський перець» | Барський cultivar ← буряк морський · Печерський cultivar ← персик звичайний · бузок перський | Перець · Гострий перець · Барський cultivar ← Буряк |
| uk | рослина | «полуниця» | Порадниця cultivar ← Triticum aestivum · Полка cultivar · Полум'я cultivar ← Хризантема | Полуниця · Пшениця · Порадниця cultivar ← Пшениця |
| uk | рослина | «кабачок» | Ківі cultivar ← гарбуз звичайний · РЕЙ cultivar ← гарбуз звичайний · Арал cultivar ← гарбуз звичайний | Кабачок · Гарбуз · Ківі cultivar ← Гарбуз |
| uk | рослина | «броколі» | марена красильна · Арес cultivar ← капуста городня · БЕСТІ cultivar ← капуста городня | Броколі · Капуста білоголова · Арес cultivar ← Капуста білоголова |
| uk | рослина | «троянда» | Мушлі cultivar ← Rosa · Вінтаж cultivar ← Rosa · Лексані cultivar ← Rosa | Троянда · Мушлі cultivar ← Троянда · Вінтаж cultivar ← Троянда |
| uk | рослина | «вишня» | вишня звичайна · вишня кущова · Альфа cultivar ← вишня звичайна | Вишня · Черешня · Обліпиха |
| uk | рослина | «картопля» | картопля · 7 ФОР 7 cultivar ← картопля · Бео cultivar ← картопля | Картопля · 7 ФОР 7 cultivar ← Картопля · Бео cultivar ← Картопля |
| uk | рослина | «огірок» | огірки · Ела cultivar ← огірки · Іра cultivar ← огірки | Огірок · Ела cultivar ← Огірок · Іра cultivar ← Огірок |
| uk | тварина | «курка» | Balistes carolinensis · Leptosomus discolor · Gallus gallus | Курка |
| uk | тварина | «коза» | Oreamnos americanus · Capra aegagrus hircus · Capra ibex | Коза |
| uk | тварина | «кролик» | Sylvilagus floridanus · Oryctolagus cuniculus | Кролик |
| uk | тварина | «собака» | Canis lupus familiaris · Nyctereutes procyonoides · Takifugu rubripes | Собака |
| uk | тварина | «папуга» | — | Хвилястий папужка · Жако · Папуга Крамера |
| bg | рослина | «домат» | домат · Домат чери cultivar · Dombeya | Домат · Домат чери cultivar · Патладжан |
| bg | рослина | «пипер» | пипер · пипероцветни · перуански пипер | Пипер |
| bg | рослина | «ягода» | Rubus x loganobaccus · смокиня · горска ягода | Ягода · Индийска ягода |
| bg | рослина | «тиквичка» | тиквичка · тиква · тиква | Тиквичка · Тиква · Бяла тиква |
| bg | тварина | «кокошка» | Felis silvestris · Felis catus · Ameiurus melas | Кокошка |
| ru | рослина | «помидор» | томат · Помідор чері cultivar · ПОЛІДОР cultivar ← морковь дикая | Томат |
| ru | рослина | «перец» | перец овощной · стручковый перец · перец кубеба | Перец · Острый перец · Огнівец cultivar ← Перец |
| ru | рослина | «клубника» | Клубнекамыш | Клубника |
| ru | рослина | «кабачок» | Ківі cultivar ← тыква обыкновенная · РЕЙ cultivar ← тыква обыкновенная · Арал cultivar ← тыква обыкновенная | Кабачок · Лагенария · Тыква |
| ru | тварина | «курица» | курица · домашняя курица · банкивская курица | Курица · Индейка |

Statement time over the 178 fingerprint prefixes, measured from the same
machine against production: before, 65 ms median,
177 ms P95 and 753 ms max; after, 71 ms,
142 ms and 255 ms.

A typo is forgiven in the reader's language and in Latin only: before that
rule «курка» also offered the red-eared slider, matched as a misspelt
Bulgarian «Костенурка».

## Screenshots

The object-setup picker on a local build, against a clean database with the
same base loaded (the production application cannot be deployed today). The
list follows Threads' search results —
[Threads search, Mobbin](https://mobbin.com/screens/9ec395cd-7f2b-4e82-bf8e-b0ef217a3a06),
[and again](https://mobbin.com/screens/388d0e45-dfb8-488a-96b0-a106f5b22d1d):
one surface of rows split by hairlines, a round glyph, the name in weight and
one muted line.

![«полуниця» finds garden strawberry first](proof/standard-species/polunytsia.png)

![«курка» finds the domestic chicken, and nothing outside the base](proof/standard-species/kurka.png)

## Gates

- `pnpm catalog:standard-species:prove-database` (new, in CI): a dry run leaves
  nothing; the identifier, checklist, synonym and created routes; a folded
  EPPO code refused; one primary per language; a quiet second run, name for
  name; a newer file takes back what it no longer wants; the picker offers the
  base only; the save path refuses a species outside it; the rollback restores
  the source names and the migration re-applies.
- `scripts/prove-migration-reapply.ts --passes 3` on an empty database: no
  failures. `pnpm db:types:check` against a fresh bootstrap: match.
- Every CI database gate, run locally: pass.
