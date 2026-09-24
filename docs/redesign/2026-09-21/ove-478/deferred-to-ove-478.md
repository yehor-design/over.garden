# Everything the receipts defer to OVE-478

> **Snapshot, 2026-09-24,** taken while OVE-478's changes were still uncommitted in the working tree; "untracked" and "uncommitted" below describe that moment. What OVE-478 changed in answer to it is `../OVE-478-PROOF.md`.

Read-only review, 2026-09-24, of `main` @ `1aa34d6f`. Method: `git grep 'OVE-478' main` over the whole repository, excluding `linear-manifest.json` and `task-specs.json`, which only repeat issue bodies. Then every receipt under `docs/redesign/2026-09-21/` was read for deferrals that do not use the number ("final integration", "not performed"). Finally the Linear release receipt of every prerequisite issue was read. Paths are relative to `docs/redesign/2026-09-21/` unless they start with `docs/` or `apps/`.

What each group means:

- **Explicit**: the sentence names OVE-478.
- **Implicit**: it names "final integration", "final convergence" or "final proof" (OVE-478 per `EXECUTION_CONTRACT.md:70`), or says the work was not done without naming an owner.
- **Status on main** is given only where it can be checked from the repository.

## 1. Real screen-reader / manual AT session (explicit)

Thirteen repo receipts defer a real screen-reader session to OVE-478. None of them records one. Together they converge on OVE-478 criterion 7 ("at least one real screen-reader/browser pairing and record its version", `issues/OVE-478.md:44`). Its Proof clause applies if access is missing: "If real AT/tool access is unavailable, record the blocked proof and keep that acceptance criterion open." (`issues/OVE-478.md:61`)

| # | File:line | Quote | Surfaces never heard with AT |
|---|---|---|---|
| 1 | `OVE-482-PROOF.md:64-65` | "No real screen-reader session was run for this task; OVE-478 owns the integrated AT transcript." | `FilterBar` on `/journals`, `/catalog`, `/communities/{slug}`, `/knowledge` |
| 2 | `OVE-484-PROOF.md:63` | "No real screen-reader session (OVE-478 owns it)." | `/garden/spaces/new`, the space sheet inside the composer |
| 3 | `OVE-485-PROOF.md:68` | "No real screen-reader session (OVE-478)." | `/garden/objects/new`, catalogue launch |
| 4 | `OVE-486-PROOF.md:73` | "No real screen-reader session (OVE-478)." | `/garden/new`, contextual composer |
| 5 | `OVE-489-PROOF.md:149` | "No real screen-reader session (OVE-478)." | `/garden` collection |
| 6 | `OVE-490-PROOF.md:127` | "No real screen-reader session (OVE-478)." | `/garden/spaces/[id]`, `/settings` |
| 7 | `OVE-491-PROOF.md:192` | "**A real screen-reader session** (OVE-478)." | `/garden/objects/[id]`, `/settings`, `/provenance` |
| 8 | `OVE-492-PROOF.md:150-151` | "**A real screen-reader session** (OVE-478). The language scoping is asserted in the DOM, not heard." | feed cards, `/feed`, `/journals` (also OG-UX-030's "verify with a screen reader") |
| 9 | `OVE-493-PROOF.md:150` | "**A real screen-reader session** (OVE-478)." | `/@handle/post/n` |
| 10 | `OVE-494-PROOF.md:174` | "**A real screen-reader session** (OVE-478)." | `/@handle` |
| 11 | `OVE-495-PROOF.md:239` | "**A real screen-reader session** (OVE-478)." | `/garden/lineage/**`, passport |
| 12 | `OVE-503-PROOF.md:165` | "**A real screen-reader session** (OVE-478)." | `/garden/profile`, `/account/settings`, `/account/security` |
| 13 | `OVE-504-PROOF.md:222` | "**A real screen-reader session** (OVE-478)." | `/auth/*` screens, intent flows |

The same deferral also appears in the Linear release receipts:

| Issue | Linear comment | Quote |
|---|---|---|
| OVE-482 | 27281f2e (2026-09-22) | "Not claimed: no real screen-reader session (OVE-478). /q twin results still need JS for scripts-off visibility (OVE-461 scope)." |
| OVE-484 | a778bfd0 (2026-09-22) | "Not claimed: no real screen-reader session (OVE-478)." |
| OVE-485 | 4c9e7baf (2026-09-22) | "Not claimed: no real screen-reader session (OVE-478)." |
| **OVE-488** | b7d3a0e5 (2026-09-22) | "No real screen-reader session (OVE-478)." **This is the only place for OVE-488: its repo receipt does not say it.** |
| OVE-489 | 6d89ec80 (2026-09-22) | "No real screen-reader session (OVE-478)." |
| OVE-490 | a6579ac2 (2026-09-23) | "…a real screen-reader session (OVE-478)." |
| OVE-491 | c984db64 (2026-09-23) | "A real screen-reader session (OVE-478)." |
| OVE-492 | 9373f6a2 (2026-09-23) | "a real screen-reader session (OVE-478)." |
| OVE-493 | 71fd5ce8 (2026-09-23) | "a real screen-reader session (OVE-478)." |
| OVE-494 | d73481a0 (2026-09-23) | "a real screen-reader session (OVE-478)." |
| OVE-495 | cbcea22d (2026-09-23) | "A real screen-reader session (OVE-478)." |
| OVE-503 | 7f3c2e47 (2026-09-23) | "…and a manual screen-reader session (OVE-478)." |
| OVE-504 | 59d21ac3 (2026-09-23) | "An unverified address walked in a browser, and a real screen-reader session (OVE-478): as listed in the proof document." |

## 2. Screen reader / manual AT not performed, OVE-478 not named (implicit)

| File:line | Quote |
|---|---|
| `OVE-476-PUBLICATION-PROMISES.md:93-94` | "This is targeted manual evidence, not a claim of a complete screen-reader audit of the product." |
| `OVE-479-PROOF.md:70-72` | "A native VoiceOver/NVDA session was not performed, and no complete screen-reader or whole-product WCAG conformance is claimed." |
| `OVE-480-PROOF.md:69-71` | "Screen-reader sessions were **not performed** for this infrastructure task. 320 CSS pixels model the reflow width of a 1280px viewport at 400%; they do not claim actual browser-UI zoom or operating-system AT proof." |
| `OVE-481-PROOF.md:72` | "No native VoiceOver/NVDA session is claimed." |
| `OVE-481-PROOF.md:95` | "This visual inspection is not a native screen-reader session." |
| `OVE-483-PROOF.md:89-90` | "Native screen-reader speech is not claimed by these automated proofs." |
| `ACCESSIBILITY_FIXTURES.md:39` | 400 % reflow row: "Browser zoom/AT manual check below remains required" |
| `ACCESSIBILITY_FIXTURES.md:103-104` | "Unperformed AT steps must remain marked unperformed in a task receipt. Never substitute an axe score or screenshot for listening to the actual announcement." |

**Receipts that say nothing about screen readers**: OVE-487, OVE-488 (repo copy), OVE-496, 497, 498, 499, 500, 501, 502, 505, 506, and OVE-467, 468, 469. Treat their surfaces as not heard. The six-step protocol OVE-478 inherits is `ACCESSIBILITY_FIXTURES.md:76-104`: landmarks and rotor; global Write with duplicate names; validation, offline and slow announcements; 400 % zoom; forced colors; real photo alternatives.

## 3. Accessibility gate state (explicit)

| File:line | Quote | Status on main |
|---|---|---|
| `OVE-480-PROOF.md:75-77` | "OVE-482 and OVE-483/486 must remove their expected-failure annotations as they correct those behaviors. OVE-478 must not sign off with any of them still expected to fail." | **Satisfied.** `apps/web/tests/redesign-baselines.spec.ts:43, 56, 68` are ordinary tests, and there is no `test.fail` in the file. The removals are recorded in `OVE-482-PROOF.md:50-52`, `OVE-483-PROOF.md:92-95` and `OVE-486-PROOF.md:43-44`. Stale text remains at `ACCESSIBILITY_FIXTURES.md:69-71`, which still says the OVE-486/483 annotations "are intentionally visible in gate output". |
| Linear OVE-480 description, release receipt | "Final integration cannot retain these expected failures." | Same as above. |

Not deferred by any receipt, but on OVE-478's path (criterion 9, "Automated wcag22aa rules supplement manual proof"):

- 17 gate spec files still scan with `["wcag2a","wcag2aa","wcag21aa"]` only. One is the original gate, `apps/web/tests/accessibility.spec.ts:44`, which is also OG-UX-028's locator.
- One more scan does the same: `apps/web/tests/owner-catalog-curation.spec.ts:1452`.
- `ACCESSIBILITY_FIXTURES.md:54-55` says: "Existing page-family suites retain their earlier 2.1 scans until migration; do not describe them as 2.2 coverage."

## 4. Route, state and role coverage the plan assigns to OVE-478 (explicit)

| File:line | Quote |
|---|---|
| `INFORMATION_ARCHITECTURE.md:54` | Row "Catch-all, 404/410, `/q`, skeleton diagnostics \| Anyone as appropriate: recover/render correct response \| Preserve redirect/status/parameter policy \| No retired feature resurrection or public diagnostic menu \| OVE-478, OVE-482" |
| `INFORMATION_ARCHITECTURE.md:93` | "6. OVE-478 verifies full route/state/locale/role coverage, manual AT, real server outcomes and production budgets after OVE-468/469, then releases. Remove redundant transitional entrances after their replacements are proven, not before." |
| `ROUTE_OWNERSHIP.md:3` | "New IA routes are finalized by OVE-475 and covered by OVE-478 integration." |
| `ROUTE_OWNERSHIP.md` — 32 rows | Each reads "Catch-all/retirement or source alias: verify current redirect/404 contract, do not restore a retired feature." for `apps/web/src/app/(default)/<x>/[...missing]/page.tsx`. The rows (line x) are: 7 account, 11 answers, 13 auth, 19 blog, 22 bookmarks, 24 breed, 26 catalog, 28 col, 29 communities, 33 eppo, 34 erasure, 36 feed, 38 first-publication-disclosure, 41 garden, 68 gbif, 69 guides, 71 id, 72 journal, 74 journals, 76 knowledge, 78 lineage, 80 markets, 82 notifications, 85 privacy, 87 skeleton, 89 sources, 92 species, 96 support, 98 topics, 100 variety, 102 wikidata, 103 wishlist. All 32 files exist on `main`, and `main` has exactly 32 `[...missing]` pages under `(default)`. |
| `ROUTE_OWNERSHIP.md:88` | `apps/web/src/app/(default)/skeleton/page.tsx`: "Review actual purpose; diagnostic route must not be mistaken for product." The file exists on `main`. |

## 5. Final integration, release and production proof (explicit and implicit)

| File:line | Quote | Note |
|---|---|---|
| `EXECUTION_CONTRACT.md:70` (explicit) | "Cross-product consistency, integrated accessibility and release form OVE-478, which executes last. Its former icon work moved into OVE-477; consumers no longer depend on OVE-478. The final task waits on all other 31 implementation issues and OVE-467/468/469." | Consolidated scope (original work packages 36–38). |
| `README.md:7` (explicit) | "…localization/integrated accessibility/release 36–38 → repurposed integration issue OVE-478. No scope was dropped. **OVE-478 executes last despite its low issue number.**" | Same scope. |
| `OVE-481-PROOF.md:72-74` (implicit) | "This slice does not close the three expected UX failures owned by the destination picker, composer and mobile filters, nor the static/performance prerequisites of final integration." | First half is closed on `main` (see §3). Second half: OVE-467/468/469 are Done, but two production criteria are unmet (§6). |
| `EXECUTION_CONTRACT.md:52` (implicit) | "Do not run conflicting shell edits concurrently; final convergence verifies both." | OVE-468 lazy chrome plus the new shell. |
| `EXECUTION_CONTRACT.md:53` (implicit) | "Final redesign release consumes its production acceptance, not a lighter local substitute." | OVE-469's production acceptance, which closed unmet. |
| `EXECUTION_CONTRACT.md:62` (implicit) | "Minimum representative viewports are 320/390/768/1280/1920 CSS px; select all applicable to the change, with integrated full matrix in final proof." | The viewport/role/locale matrix. |
| `EXECUTION_CONTRACT.md:66` (implicit) | "The integration ledger maps every finding and every route family to its implementation issue and evidence." | `finding-ledger.md` is the finding half; the route-family half is still open. |
| `INFORMATION_ARCHITECTURE.md:93` (explicit) | "…real server outcomes and production budgets after OVE-468/469…" | See §6. |

No receipt defers a **production measurement or production mutation** to OVE-478 by number. The receipts that say production mutations were **not** exercised (read-only checks only) are:

- `OVE-495-PROOF.md:228-231`
- `OVE-496-PROOF.md:231-232`
- `OVE-505-PROOF.md:200-201`
- Linear comments: OVE-488 b7d3a0e5, OVE-489 6d89ec80, OVE-500 728e20a7, OVE-501 63e0172f, OVE-503 7f3c2e47 (retired-handle 308 not observable)

OVE-478 criterion 16 has to decide what production mutation proof it can be authorized to collect.

## 6. Deferred to the owner, not to OVE-478 (context for criteria 14/15)

| File:line | Quote |
|---|---|
| `OVE-469-PROOF.md:4-10` | "Criterion 3 — LCP ≤ 2.0 s and FCP ≤ 1.5 s applied, on production — is **not met**… On 2026-09-24 the owner closed the issue with these facts and left the budget's number and method for photograph-led pages as an open decision (`docs/PROJECT_STATE.md`, known gap 11)." |
| `docs/PROJECT_STATE.md:2327-2328` | "The LCP budget is not met on production for a page led by a photograph, and which number it should be, measured how, is the owner's open decision." |
| `docs/PROJECT_STATE.md:2347-2350` | "Linear refused to create that card: the workspace is at its free issue limit. So the decision is recorded here until the card exists." |
| Linear OVE-467 comment 07f5a438 | "This issue stayed In Progress for one criterion only: the production LCP budget… That decision closes this criterion the same way." |

OVE-478 criterion 15 reads "Preserve existing production LCP/FCP/CLS acceptance owned by OVE-469; never substitute local measurements for production". That acceptance is closed unmet, so criterion 15 depends on the owner's known-gap-11 decision.

## 7. Open items outside OVE-478 that its ledger must still classify (criteria 12 and 17)

These are not deferred to OVE-478. They are listed because criterion 12 requires every finding to map to a receipt "or explicit unresolved condition", and criterion 17 requires residuals to be "linked and honestly classified".

- **Sign-in and sign-up via Server Action are not rate-limited.** `docs/PROJECT_STATE.md:395-401`, `OVE-504-PROOF.md:208-214`. No Linear issue (issue limit).
- **Follow-ups the receipts leave open:**
  - The "breed" label and borderless secondary link-buttons outside the lineage pages (`OVE-495-PROOF.md:237-238`); "filed" while Linear is at its limit.
  - An owner-curation flake "proposed as its own task" (Linear OVE-469 comment 643051f3).
  - Phosphor's unused weights (`OVE-468-PROOF.md:189-195`, owner rule in DESIGN.md §2.8).
  - A communities tab on profiles, an owner decision (`OVE-494-PROOF.md:172-173`).
  - Pests' host lists still whole (`OVE-497-PROOF.md:180-181`).
  - The EPPO record page stays request-time (`OVE-467-REMAINING-PROOF.md:124`).
- **[source check] Residuals this review found on `main`** (details in `finding-ledger.md`):
  - English region labels on the entry page, organism-card experiences and public lineage pages (OG-UX-025).
  - `alt=""` on every photo in the Following feed, community cards and saved-entry cards (OG-UX-029).
  - 17 spec files still on WCAG 2.1 axe tags (OG-UX-028).
  - An unused `startJournal` copy key (OG-UX-040).
- **Stale documentation for criterion 17:**
  - `docs/PROJECT_STATE.md:52` says "complete product redesign, not yet shipped".
  - `docs/PROJECT_STATE.md:2237-2241` (known gap 3) still says unconverted families "show only their chrome", that a successful sign-in "was never walked through", and that "the other Playwright specs still run by hand". OVE-467, OVE-504 (`auth-intent.spec.ts`) and the gate list contradict all three.
  - `ACCESSIBILITY_FIXTURES.md:69-71` describes expected-failure annotations that no longer exist.
