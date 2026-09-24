# Baseline diff — page files at the audit baseline vs. today (OVE-478, criterion 1)

> **Snapshot, 2026-09-24,** taken while OVE-478's changes were still uncommitted in the working tree; "untracked" and "uncommitted" below describe that moment. What OVE-478 changed in answer to it is `../OVE-478-PROOF.md`.

Baseline: `docs/audits/2026-09-21-product-design/ROUTES.md` (114 rows, lines 9-122) at `e554aec5`. `git ls-tree -r e554aec5 -- apps/web/src/app | grep /page.tsx$` also gives 114 files, and the two lists are identical (no file in one and not the other). Current: `find apps/web/src/app -name page.tsx | sort` = 132 files (working tree of branch `claude/fervent-mendel-hnadyo`, HEAD `1aa34d6f`; the uncommitted changes in the tree touch no `page.tsx`). "#" refers to the row number in `route-matrix.md` §2.

Note on history: the clone is shallow (50 commits, graft root `a0705aa7`), so `git log --diff-filter=A` answers only for files added after 2026-09-20; for the baseline files it would name the graft root, which is not their real origin. All 18 new files were added inside that window, so their answers below are real.

## 1. Summary

| Measure | Count |
|---|---:|
| Baseline page files (ROUTES.md = git tree at `e554aec5`) | 114 |
| Baseline files that no longer exist | **0** |
| Current page files | 132 |
| Files new since the baseline | **18** |
| `ROUTE_OWNERSHIP.md` file rows | 126 = 114 baseline + 12 added later |
| Current files with no `ROUTE_OWNERSHIP.md` row | **6** (every one a `/q` twin) |
| `ROUTE_OWNERSHIP.md` rows naming a file that no longer exists | 0 |

## 2. Baseline files that no longer exist — none

Every one of the 114 baseline files is still at its baseline path. The IA moved **functions** out of baseline files into new files rather than deleting or renaming files (docs/redesign/2026-09-21/INFORMATION_ARCHITECTURE.md:30-54):

| Baseline file (still present) | Function that moved out | Now in | Issue |
|---|---|---|---|
| `(default)/garden/(home)/page.tsx` (#37) | the full editors, the space composer, first-entry setup | `garden/new` (#45), `garden/spaces/new` (#54), `garden/objects/new` (#49), `garden/spaces/[spaceId]` and `/settings` (#52-53); `/garden?space={id}` now answers 308 to the space page (src/proxy.ts:874-883) | OVE-486, OVE-484, OVE-485, OVE-490 |
| `(default)/garden/objects/[objectId]/page.tsx` (#46) | management, privacy, catalogue matching, provenance blocks | `…/settings` (#48), `…/provenance` (#47); the old `#passport-*` fragments re-home in the browser (src/lib/garden/object-pages.ts:32-49) | OVE-491 |
| `(default)/garden/profile/page.tsx` (#51) | sign-in methods, interface language, blocked list, privacy/erasure way | `account/security` (#6), `account/settings` (#7) | OVE-503 |
| `[locale]/notifications/page.tsx` (#113) | Activity preferences | `[locale]/notifications/settings` (#114), answered by `/api/notifications/preferences` | OVE-501 |
| `(default)/account/communities/[slug]/page.tsx` (#2) | whether the community accepts members and entries | `account/communities/[slug]/settings` (#3) | OVE-500 |
| `(default)/support/page.tsx` (#84) | the Ukrainian static document | `[locale]/support` (#129); the proxy rewrites `/support` into it | OVE-476 (file), OVE-505 (row) |
| the listings `[locale]/{catalog,journals,knowledge,sources/eppo}`, the profile and the community page | reading the query string (a page that reads `searchParams` cannot be a static document, ADR-0032 D5) | the `/q` twins #117-121, #123 (the home feed's twin `[locale]/q/page.tsx`, #122, was already there at the baseline) | OVE-467 |

## 3. Files new since the baseline (18)

| # | File | Added by (`git log --diff-filter=A`) | Issue | `ROUTE_OWNERSHIP.md` row | Class |
|---:|---|---|---|---|---|
| 3 | `(default)/account/communities/[slug]/settings/page.tsx` | `2e348012` feat(communities): one step to add an entry that keeps its community… (#465), 2026-09-23 | OVE-500 | :67, same PR | migrated |
| 6 | `(default)/account/security/page.tsx` | `995946d3` feat(account): the public profile, settings, and sign-in and security as three pages (#457), 2026-09-23 | OVE-503 | :66, same PR | migrated |
| 7 | `(default)/account/settings/page.tsx` | `995946d3` (#457) | OVE-503 | :65, same PR | migrated |
| 45 | `(default)/garden/new/page.tsx` | `aa52d1dc` feat(garden): one entry composer for every New entry (#447), 2026-09-23 — issue named only in the body | OVE-486 | :142, same PR | migrated |
| 47 | `(default)/garden/objects/[objectId]/provenance/page.tsx` | `1322e59c` feat(garden): an object's history, its settings and its provenance (#453), 2026-09-23 | OVE-491 | :146, same PR | migrated |
| 48 | `(default)/garden/objects/[objectId]/settings/page.tsx` | `1322e59c` (#453) | OVE-491 | :145, same PR | migrated |
| 49 | `(default)/garden/objects/new/page.tsx` | `29bdd451` feat(garden): add a plant or an animal through a short progressive flow (#446), 2026-09-22 — issue in the body | OVE-485 | :141, same PR | migrated |
| 52 | `(default)/garden/spaces/[spaceId]/page.tsx` | `5524f2ab` feat(garden): a space's own page, its history and its settings (#452), 2026-09-23 | OVE-490 | :143, same PR | migrated |
| 53 | `(default)/garden/spaces/[spaceId]/settings/page.tsx` | `5524f2ab` (#452) | OVE-490 | :144, same PR | migrated |
| 54 | `(default)/garden/spaces/new/page.tsx` | `b4cde76b` feat(garden): create a space through a short progressive flow (#444), 2026-09-22 | OVE-484 | :140, same PR | migrated |
| 114 | `[locale]/notifications/settings/page.tsx` | `a1d53f7a` feat(activity): rows that say what they are about… (#466), 2026-09-23 | OVE-501 | :127, same PR | migrated |
| 117 | `[locale]/q/[profileHandle]/page.tsx` | `842a96b6` perf(profile): serve profiles and object passports as static documents (#441), 2026-09-22 — no issue id in the commit; docs/PROJECT_STATE.md:536-541 calls it the third OVE-467 family | OVE-467 | **none** | migrated |
| 118 | `[locale]/q/catalog/page.tsx` | `51d814a7` perf(catalog): serve the directory as a static document (#440), 2026-09-21 — second OVE-467 family (PROJECT_STATE.md:543-546) | OVE-467 | **none** | migrated |
| 119 | `[locale]/q/communities/[slug]/page.tsx` | `c098bd28` perf(communities): serve the list and a community as static documents (#442), 2026-09-22 — fourth OVE-467 family (PROJECT_STATE.md:527-534) | OVE-467 | **none** | migrated |
| 120 | `[locale]/q/journals/page.tsx` | `d10c002e` perf(journals): serve the directory as a static document (#439), 2026-09-21 — first OVE-467 family (PROJECT_STATE.md:548-554) | OVE-467 | **none** | migrated |
| 121 | `[locale]/q/knowledge/page.tsx` | `ff347966` perf(public): serve the remaining public families as static documents (#445), 2026-09-22 (PROJECT_STATE.md:516-525) | OVE-467 | **none** | migrated |
| 123 | `[locale]/q/sources/eppo/page.tsx` | `ff347966` (#445) | OVE-467 | **none** | migrated |
| 129 | `[locale]/support/page.tsx` | `a84b1c17` fix: align public publication promises and retain versioned acceptance (#432), 2026-09-21, one PR after the baseline (#430) and after the IA ratification (#431); docs/redesign/2026-09-21/OVE-476-PUBLICATION-PROMISES.md:76-81 describes it | OVE-476 | :130, owner OVE-505 — the row arrived later with `fa89ec05` (#460, OVE-505) | migrated |

## 4. Consistency of `ROUTE_OWNERSHIP.md` with the tree

1. **Six current files have no row** — the `/q` twins #117-121 and #123. The OVE-467 PRs that created them (#439-#445) never edited the table (it held 114 rows when OVE-475 ratified it in `165471e0`, #431, and the twins were then not yet written). Their *family* is owned: `INFORMATION_ARCHITECTURE.md:54` gives `/q` to OVE-478/OVE-482, and the rows for the profile (:105) and the catalogue (:114) name their own twins in the notes. So this is a missing file row, not an unowned family — but criterion 1 asks for the matrix to be complete, so it is an **integration gap to close in the table**.
2. The heading still says "coverage responsibility for all 114 baseline page files" (ROUTE_OWNERSHIP.md:3) over 126 rows. Eleven of the twelve later rows were appended at the end or marked "New."; `[locale]/support/page.tsx` (:130) sits among the baseline rows without that marker, although the file is not in the baseline (ROUTES.md has no such row).
3. Thirty-three rows are owned by OVE-478 itself — the 32 catch-alls (:7, :11, :13, :19, :22, :24, :26, :28, :29, :33, :34, :36, :38, :41, :68, :69, :71, :72, :74, :76, :78, :80, :82, :85, :87, :89, :92, :96, :98, :100, :102, :103) and the skeleton page (:88). Their note asks to "verify current redirect/404 contract" and, for the skeleton, to "review actual purpose"; route-matrix.md §3 and row #75 do that. OVE-478 has no receipt yet: `tests/route-families.spec.ts:50` names `docs/redesign/2026-09-21/OVE-478-PROOF.md`, which does not exist.
4. The OVE-478 link text in every such row still carries the issue's old Linear slug ("migrate-every-interface-icon-to-phosphor-and-remove-mixed-icon"); the issue is now "Integrate, verify and release the complete product redesign" (docs/redesign/2026-09-21/issues/OVE-478.md:1-3). Cosmetic.
5. Two row notes are narrower than the code: `(default)/lineage/objects/[objectId]` (:79) "308s to the handle address" — true for a document request when the object has an address, but the file still renders the passport for an object without a slug, the one fallback `publicObjectPassportAddress` emits (src/lib/garden/public-paths.ts:181); and the `variety`/`breed` rows describe the organism card without saying the addresses are legacy 308 aliases that stay canonical only for a form with no species parent (src/lib/garden/public-paths.ts:127-136; tests/catalog-addresses.spec.ts:122-129).
6. No row names a file that is gone; every owner in the table has a receipt file (`docs/redesign/2026-09-21/OVE-4xx-PROOF.md`) except OVE-478.

## 5. Every current file has an owner and a classification

- **Owner:** 126 of 132 files through their `ROUTE_OWNERSHIP.md` row; the remaining 6 (`/q` twins) through their family and IA line 54 only — the gap in §4.1.
- **Classification:** all 132 in `route-matrix.md` §1-2 — migrated 90, redirected 9, retired 32, diagnostic 1, future 0 (the future capabilities have no file; route-matrix.md §5).
- **Integration gaps from this diff** (to fix under OVE-478, not blockers of other issues):
  1. Add file rows for `[locale]/q/[profileHandle]`, `q/catalog`, `q/communities/[slug]`, `q/journals`, `q/knowledge`, `q/sources/eppo` (created by OVE-467; views owned by OVE-494, OVE-496, OVE-500, OVE-492, OVE-498, OVE-499 with OVE-482 for the query-view contract).
  2. Mark `[locale]/support/page.tsx` as added after the baseline (by OVE-476) and correct the "114" heading.
  3. Write `OVE-478-PROOF.md`, which the 33 OVE-478 rows and the untracked route-families spec both point to.
