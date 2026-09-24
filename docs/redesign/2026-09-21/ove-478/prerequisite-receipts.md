# Prerequisite receipts for OVE-478 (criterion 13)

> **Snapshot, 2026-09-24,** taken while OVE-478's changes were still uncommitted in the working tree; "untracked" and "uncommitted" below describe that moment. What OVE-478 changed in answer to it is `../OVE-478-PROOF.md`.

Read-only, 2026-09-24. Sources:

- **Git.** `git log main` in `/home/user/over.garden`; `main` = `1aa34d6fb429121ca540ac721496922384f09442`.
- **GitHub.** PR list and check runs for `yehor-design/over.garden`.
- **Linear.** Issue status, `completedAt` and the release receipt on each issue (description Proof section or comment, cited by comment id).
- **Repo receipts** under `docs/redesign/2026-09-21/`.

## How each column was checked

- **Squash commit.** Every program PR landed as one squash commit whose subject ends `(#NNN)`. Twelve subjects carry no issue key: #432–#436, #439–#442 and #445–#447. #437 puts the key at the start instead. For these, the issue was identified from the PR branch (`codex/ove-4xx-…`), the Linear attachment and the receipt text.
- **Tested head vs main.** `git diff <PR head> <squash>` is empty for 36 of 39 PRs, so the tree CI tested is the tree on `main`. Three heads are not in the local object store (#432, #441, #442), so their tree identity was **not** verified here.
- **CI.** For every PR listed, all six check runs are `success` on the PR head: Web app (required), Web app checks, Browser proof 1/2 and 2/2, Python matching tier, and Vercel Preview Comments. The run id given is the Actions run of the "Web app" job.
- **Deployment.** The deployment id is copied from the Linear release receipt. "Not named" means that receipt reports a completed production deploy without an id.
- **Merged.** The time is GitHub `merged_at` (UTC), which equals the squash commit time.

## Table

| Issue | Squash commit (short / full) | PR | Merged (UTC) | Receipt file(s) | Linear status (completed, UTC) | Tested head → tree on main | CI run (all checks green) | Production deployment (Linear receipt) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| OVE-467 | `d10c002e` / `d10c002ead8962b543da3c8807185a1277430c25`<br>`51d814a7` / `51d814a73a3c1ab283884045ad3222d609bbe20d`<br>`842a96b6` / `842a96b6e20d55bce987f0040d8d0eb6e935f824`<br>`c098bd28` / `c098bd28e04d5e962c3975a6c967d30bf68ff262`<br>`ff347966` / `ff347966028919799f338a527495e5a3176f4ed2` | #439 journals<br>#440 catalog<br>#441 profile+passport<br>#442 communities<br>#445 remaining families | 2026-09-21 18:54<br>2026-09-21 19:32<br>2026-09-22 17:15<br>2026-09-22 18:09<br>2026-09-22 20:31 | OVE-467-JOURNALS-PROOF.md, OVE-467-CATALOG-PROOF.md, OVE-467-PROFILE-PROOF.md, OVE-467-COMMUNITIES-PROOF.md, OVE-467-REMAINING-PROOF.md (+ `ove-467-*/`) | Done 2026-09-24 08:11:24 (project "SDD Slice 28") | `dd510947` ✓<br>`c41aeecb` ✓<br>`4fad715c` not local<br>`b48bbf82` not local<br>`110ddd96` ✓ | 35640381821<br>35644435607 (one community axe test passed on retry)<br>35758523289<br>35763877715<br>35779770119 | #439 `dpl_8opJcEmqnvYzFiHvDX4ZzEwm6qd9`<br>#440 `dpl_4DArMS7zyWARx3NNb1XhuBQNijv9`<br>#441, #442 **none recorded**<br>#445 `dpl_AQc2dp2GyMcoC2vUkB64aJZpoA4X` | **Shipped across five PRs.**<br>• The last five families went as one PR at the owner's instruction (OVE-467-REMAINING-PROOF.md:9-14).<br>• #441 and #442 have no Linear release text; the communities receipt defers its gate totals to "the pull request" (OVE-467-COMMUNITIES-PROOF.md:47, 60).<br>• The GitHub integration flipped the issue Done↔In Progress on each merge.<br>• **Closed with criterion 2 (production LCP ≤ 2.0 s) unmet.** Applied LCP is about 3.1–5.2 s; CLS is met. The owner closed it by the decision recorded as known gap 11 (Linear comment 07f5a438). |
| OVE-468 | `616d8192` / `616d8192f9d14aa363a01a3a445e186eb59ffe15` | #469 | 2026-09-23 23:02 | OVE-468-PROOF.md (+ `ove-468/`) | Done 2026-09-23 23:02:14 | `77b1f215` ✓ | 35930582034 (no retries) | Not named ("the production deploy of 616d8192 completed", comment c091acd5) | Guest script before `load` is −29…−30 % locally and on production. Production applied LCP after release: `/` 5.73 s, entry 2.80 s, species 5.16 s, so the budget is still unmet. Not changed: Phosphor's four unused weights (an owner rule in DESIGN.md §2.8). |
| OVE-469 | `1aa34d6f` / `1aa34d6fb429121ca540ac721496922384f09442` | #470 | 2026-09-24 08:02 | OVE-469-PROOF.md (+ `ove-469/`) | Done 2026-09-24 08:02:37 | `5335d048` ✓ | 35971626368 (final head, no retries; the gate-fix run 35969679176 passed one owner-curation test on retry) | URL `over-garden-ki981u6o0-yehors-projects-01221e2b.vercel.app` READY on the squash; no `dpl_` id | **Closed with criterion 3 unmet** (LCP ≤ 2.0 s and FCP ≤ 1.5 s applied, on production). Production: `/` 5.32 s, species 5.09 s, text entry 2.82 s (OVE-469-PROOF.md:4-10, 186-190). This is `docs/PROJECT_STATE.md` known gap 11 (:2327-2351). The owner-approved production backfill wrote 29 variants for 15 photos. The follow-up card could not be created because Linear is at its issue limit; its text is in comment 643051f3. |
| OVE-475 | `165471e0` / `165471e014b3966f0b224048b9b02ba8bc3ce633` | #431 | 2026-09-21 11:55 | OVE-475-PROOF.md (+ INFORMATION_ARCHITECTURE.md, ROUTE_OWNERSHIP.md, `wireflows/`) | Done 2026-09-21 11:55:41 | `cab7dec4` ✓ | 35595946206 | None (docs and canon only) | The receipt is in the Linear description. It is "a pre-merge implementation receipt, not evidence of a production release" (OVE-475-PROOF.md:16). |
| OVE-476 | `a84b1c17` / `a84b1c17cdae430936197bfae164fb7abdcfa22f` | #432 | 2026-09-21 12:39 | OVE-476-PUBLICATION-PROMISES.md + OVE-476-CLAIM-LEDGER.json | Done 2026-09-21 12:39:58 | `dc2facc6` not local | 35600193841 | `dpl_ByhgebF2S9gAK3GupSvJKh9jmHkp` | No issue key in the subject. Production migration 0079 was applied before release (PRODUCTION_SCHEMA_STATE.md). |
| OVE-477 | `6b5a7040` / `6b5a70402282adf021cae354ffc7c23b70496e2e` | #433 | 2026-09-21 13:47 | OVE-477-PROOF.md (+ `ove-477/`) | Done 2026-09-21 13:47:36 | `403545e5` ✓ | 35606929702 | `dpl_A1u2UX6QpcAU5efqcx4fanTYAyVd` | No issue key in the subject. Initial JS grew by 17,327 gzip bytes (+4.73 %), stated as a tradeoff. |
| OVE-479 | `88f02031` / `88f02031f943e11a7e754bb403fd1dfee653d806` | #435 | 2026-09-21 14:59 | OVE-479-PROOF.md (+ `ove-479/`) | Done 2026-09-21 14:59:28 | `462fa38e` ✓ | 35614807833 | `dpl_6zj6KxNGJEBurWAJJpPKPtnYASNn` | No issue key in the subject. It merged after OVE-480 (#434). No native SR session. |
| OVE-480 | `a4c9a110` / `a4c9a1106d3e8cfeb5b1b4c7a11f378d55eaf7e2` | #434 | 2026-09-21 14:24 | OVE-480-PROOF.md + ACCESSIBILITY_FIXTURES.md (+ `ove-480/`) | Done 2026-09-21 14:24:18 | `6c90d2d2` ✓ | 35610909654 | `dpl_6hbW5AbsUfJohNcRCYaAKvrv4FMW` | No issue key in the subject. All three of its expected-failure baselines are ordinary passing tests on `main`, with no `test.fail` (`tests/redesign-baselines.spec.ts:43, 56, 68`). |
| OVE-481 | `cbeb54df` / `cbeb54df13cf09539265e76a0738eff84021e98e` | #436 | 2026-09-21 15:48 | OVE-481-PROOF.md (+ `ove-481/`) | Done 2026-09-21 15:48:44 | `928be617` ✓ | 35620471787 (one test passed on retry after a localhost ECONNRESET, per Linear) | `dpl_6dksPdDR4UfYoSa1QcSN4LK3kpGG` | The squash subject lacks the key; the PR title has it. The interim `/garden#inventory` write bridge was replaced by OVE-486. |
| OVE-482 | `a5d475a9` / `a5d475a93589daf0de9d539a86f3f53ddd345b00` | #443 | 2026-09-22 18:55 | OVE-482-PROOF.md | Done 2026-09-22 18:55:47 | `dca166bc` ✓ | 35769433375 | `dpl_4uqiCyhcdhPw15TBW3C5qzRyTeC4` | Receipt in comment 27281f2e. No screenshot directory was committed. |
| OVE-483 | `753e7cd3` / `753e7cd3ee66a441bf6ea45cf96863c33dde3680` | #437 | 2026-09-21 16:53 | OVE-483-PROOF.md (+ `ove-483/`) | Done 2026-09-21 17:00:44 (Done 16:53, reopened 16:54, Done again) | `d3074ecb` ✓ | 35627467038 (communities axe test passed on retry after a 30 s timeout, per Linear) | `dpl_48eCXDYvVn5J9isgsRG9uD7zH5gD` | The subject is non-conventional: "OVE-483: Find every owned publication destination (#437)". |
| OVE-484 | `b4cde76b` / `b4cde76b11736b85d8aa7052738e0129f3c6ab99` | #444 | 2026-09-22 19:09 | OVE-484-PROOF.md | Done 2026-09-22 19:09:36 | `14fef296` ✓ | 35770928375 | `dpl_7MK5RRkm5J4584rZCz8zjQ3kzYXv` | Receipt in comment a778bfd0. No screenshot directory. |
| OVE-485 | `29bdd451` / `29bdd45175cfd2dbb163aa86491c61e0d4983dfd` | #446 | 2026-09-22 20:49 | OVE-485-PROOF.md | Done 2026-09-22 20:49:50 | `d784623c` ✓ | 35781505389 | `dpl_CPzA89nix95f2j1zVaaizYW2tdpG` | No key in the subject (it is in the body). Receipt in comment 4c9e7baf. No screenshot directory. |
| OVE-486 | `aa52d1dc` / `aa52d1dc98a1fd996109eb18bb9517d082a83aa7` | #447 | 2026-09-22 21:24 | OVE-486-PROOF.md | Done 2026-09-22 21:24:26 | `8ec09712` ✓ | 35783951843 | `dpl_6dX3N7oMyReNidtgA8aiSQ6rxR2R` | No key in the subject (it is in the body). Comment ec1b103d says "proof and screenshots" are in the receipt, but no `ove-486/` screenshots exist. |
| OVE-487 | `25f24929` / `25f249298cb3744af3caad3ecdd92d04a41ccd5f`<br>fix `da14a196` / `da14a19694c4f8c858f73669d84d22cf0c109e04` | #449 (+ #448) | 2026-09-22 22:12 (#448 at 21:52) | OVE-487-PROOF.md (+ `ove-487/`) | Done 2026-09-22 22:12:31 | `7b65a159` ✓; #448 `8481901c` ✓ | 35790154610; #448: 35788015796 | `dpl_Hvx1B83bVBdXNG2mmQzvhamqQzd3` | #448 fixed a live defect: every composer photo failed ("Illegal invocation"). The fix was verified in production without publishing. |
| OVE-488 | `1ee65118` / `1ee651189409996f29fa4bf7b04331804bc31c47` | #450 | 2026-09-22 23:08 | OVE-488-PROOF.md (+ `ove-488/`) | Done 2026-09-22 23:08:41 | `ae3ffa1d` ✓ | 35793028769 | `dpl_FajUfPBT9WdeKsjynuC3MzuYVz7a` | Only the Linear receipt (b7d3a0e5) defers the SR session to OVE-478. No production save or delete. |
| OVE-489 | `1e01f920` / `1e01f92095583bbc0e144c9fb384546b639187c6` | #451 | 2026-09-22 23:42 | OVE-489-PROOF.md (+ `ove-489/`) | Done 2026-09-22 23:42:25 | `322bb9a6` ✓ | 35797776055 | `dpl_84esa87Tqk2hv8VDzi4jL2S4kaWR` | 100/1000 objects are local synthetic data only. |
| OVE-490 | `5524f2ab` / `5524f2abb196a7d4d2eb05dade9f7c0c209c3a28` | #452 | 2026-09-23 00:22 | OVE-490-PROOF.md (+ `ove-490/`) | Done 2026-09-23 00:22:39 | `c5e419d6` ✓ | 35800291891 | `dpl_GiGp2ARPJZEhosmeDxZ8uEM1uDRg` | `/garden?space=` answers 308 in production. |
| OVE-491 | `1322e59c` / `1322e59c673fcc7106fc5f9dcc189de442aa40fa` | #453 | 2026-09-23 00:55 | OVE-491-PROOF.md (+ `ove-491/`) | Done 2026-09-23 00:55:57 | `e67cbca4` ✓ | 35803456003 | `dpl_2H4pJQMT8eHccmSZZkPtzgYjtm46` | The cross-kind server refusal is new. |
| OVE-492 | `247eb403` / `247eb403b678815e0d9a14785854d081838844d0` | #454 | 2026-09-23 01:34 | OVE-492-PROOF.md (+ `ove-492/`) | Done 2026-09-23 01:34:08 | `11b618e9` ✓ | 35806142334 | `dpl_68eLnFwZnZqvsPKuKfPiJAB1qnGk` | — |
| OVE-493 | `81772e97` / `81772e975fb334586624eec47f59baa26ed1dd35` | #455 | 2026-09-23 02:04 | OVE-493-PROOF.md (+ `ove-493/`) | Done 2026-09-23 02:04:49 | `6e98b05b` ✓ | 35808304810 | `dpl_6AnXHPFAaPaY2k5hj415rT54fjc3` | ADR-0029 D11 amended (the scope of `lang`). |
| OVE-494 | `5d7378b3` / `5d7378b3b1fb701dfa1fcdc4a3176ce82f0be45a` | #456 | 2026-09-23 02:56 | OVE-494-PROOF.md (+ `ove-494/`) | Done 2026-09-23 02:56:44 | `e55aba79` ✓ | 35811655889 | `dpl_BSovNvKbRHPnK32pUJeB3hThhTCe` | The communities tab is an open owner decision. |
| OVE-495 | `5222e03d` / `5222e03d3a1c69910576c3cbe7c8c41c8219305b` | #459 | 2026-09-23 06:19 | OVE-495-PROOF.md (+ `ove-495/`) | Done 2026-09-23 06:19:33 | `9856277b` ✓ | 35825293450 | `dpl_AmX9Cc7C7QKbtmV9AiVkNWVRznLZ` | Merged after OVE-503/504. Follow-ups ("breed" label elsewhere, borderless link-buttons) are called "filed", but Linear is at its issue limit (comment cbcea22d). |
| OVE-496 | `43034acb` / `43034acb8180530c4447c96966ec2e3c2d5e7f81` | #461 | 2026-09-23 10:02 | OVE-496-PROOF.md (+ `ove-496/`) | Done 2026-09-23 10:02:23 | `c6a1306c` ✓ | 35845246368 (a flaky object-pages test passed on retry; the earlier run 35842505143 failed on a real defect, fixed in `c6a1306c`) | `dpl_HzsPtQv7jMztcFooeGd4TFfRkHzA` | — |
| OVE-497 | `f499f37e` / `f499f37ecb71d904017a8043ed4683e11d5635f0` | #462 | 2026-09-23 11:02 | OVE-497-PROOF.md (+ `ove-497/`) | Done 2026-09-23 11:02:32 | `b54bb321` ✓ | 35851195352 | Not named (production read-only checks are recorded, comment 5915f7b4) | — |
| OVE-498 | `df37f8f7` / `df37f8f78c5d072f96b772f6970d565ba7f2ac3e` | #463 | 2026-09-23 12:21 | OVE-498-PROOF.md + OVE-498-PROVENANCE.md (+ `ove-498/`) | Done 2026-09-23 12:21:27 | `dba0a22a` ✓ | 35858833591 (mobile-shell axe flaked on a 429 and passed on retry) | `dpl_2RCWURQXgZWC39876D4EeZSDjYeh` | — |
| OVE-499 | `7a75f7a8` / `7a75f7a8cd9d6d2ee664ace97ab2f56c92b77d46` | #464 | 2026-09-23 13:07 | OVE-499-PROOF.md + OVE-499-ARTICLE-CONTRACT.md (+ `ove-499/`) | Done 2026-09-23 13:08:00 | `3a080fd0` ✓ | 35863644244 | `dpl_AoUivLgzCXWAsdjc9LygZ4u6A4TR` | The EPPO archive stays 404 in production because its flag is off, as intended. |
| OVE-500 | `2e348012` / `2e34801270fca2d7cf0962372b531026dc454a89` | #465 | 2026-09-23 15:14 | OVE-500-PROOF.md (+ `ove-500/`) | Done 2026-09-23 15:14:47 | `1e991f62` ✓ | 35878546447 (mobile-shell axe flaked and passed on retry) | `dpl_6KyaFvgoV7RnTUxjno2gEHUXULNA` | No production contribution or moderation mutation. |
| OVE-501 | `a1d53f7a` / `a1d53f7a9bf63ab1f2c15946621a46e8bdd65f80` | #466 | 2026-09-23 17:09 | OVE-501-PROOF.md (+ `ove-501/`) | Done 2026-09-23 17:09:18 | `d9ab699e` ✓ | 35892231620 (the earlier run 35888969668 failed twice on a 30 s communities-axe timeout; the budget was raised to 90 s) | `dpl_3UTGVEh4WCXxk1jFhfTtcejbC8eu` | — |
| OVE-502 | `54fa3fff` / `54fa3fff05a1458ec4d63bffa9405e7d4f41fed9` | #467 | 2026-09-23 18:50 | OVE-502-PROOF.md (+ `ove-502/`) | Done 2026-09-23 18:50:58 | `51283c26` ✓ | 35900505274 (shard 1 was rerun after one knowledge-pages failure; that job starts 26 min after the rest) | Not named ("production runs the tested tree", comment 7eeb6f8e) | — |
| OVE-503 | `995946d3` / `995946d3212530fc41fd3db7d3d71d0512b06983` | #457 | 2026-09-23 03:36 | OVE-503-PROOF.md (+ `ove-503/`) | Done 2026-09-23 03:36:43 | `49c155b9` ✓ | 35814347903 | `dpl_FdnvfzhUMAoyaKhMcyHnZ6topJ92` | ADR-0029 amended so a retired handle's entries answer 308. This cannot be observed in production yet: there are 0 retired handles. |
| OVE-504 | `eb9b829f` / `eb9b829f5ea2976fa93edce8dfc147ebde1113f6` | #458 | 2026-09-23 05:07 | OVE-504-PROOF.md (+ `ove-504/`) | Done 2026-09-23 05:07:08 | `46f2e8e9` ✓ | 35820363704 | `dpl_3ShKakh9jkrWaBWwakcTt8tzJapG` | **Open gap:** sign-in and sign-up through the screen are not rate-limited (`docs/PROJECT_STATE.md:395-401`). It predates OVE-504 and has no Linear issue. |
| OVE-505 | `fa89ec05` / `fa89ec05660d83b452609b3a72ff6ac8f5ae08a0` | #460 | 2026-09-23 08:08 | OVE-505-PROOF.md (+ `ove-505/`) | Done 2026-09-23 08:08:12 | `1e4f1a32` ✓ | 35834188635 | `dpl_EorxWAbFyVD381rLfM3uKKDqVzAP` | The erasure flow was exercised on the local database only. |
| OVE-506 | `6d0e2ff3` / `6d0e2ff3ce20949ad81bf6686baef110ceddcbd2` | #468 | 2026-09-23 20:08 | OVE-506-PROOF.md (+ `ove-506/`) | Done 2026-09-23 20:08:15 | `904496c4` ✓ | 35911871250 | Not named ("the production deploy of 6d0e2ff3 completed", comment d96add6e) | — |

`✓` means `git diff <tested head> <squash>` is empty. "Not local" means the head object is absent from the clone, so the tree check was not done; no fetch was made, keeping the repository read-only.

## Status context

- **OVE-478** is In Progress, started 2026-09-24T08:11:43Z. **OVE-474**, the coordination parent, is In Progress. All 31 other children and OVE-467/468/469 are Done.
- **Receipts gaps to close before OVE-478 can confirm criterion 13:**
  - Production deployment ids are missing for OVE-467 (#441, #442), OVE-468, OVE-469 (URL only), OVE-497, OVE-502 and OVE-506.
  - Tree identity is unverified locally for #432, #441 and #442.
- **Two prerequisites closed unmet by owner decision:**
  - OVE-469, criterion 3 (production LCP/FCP).
  - OVE-467, criterion 2 (production LCP per family).
  - Both point to `docs/PROJECT_STATE.md` known gap 11. OVE-478 criterion 15 says to preserve OVE-469's production acceptance and never substitute local numbers. With no card for the budget decision, that criterion cannot be met as written unless the owner rules on known gap 11.

## Deployment ids found by OVE-478 (Vercel, read-only, 2026-09-24)

The receipts that named no production deployment, looked up by the squash commit
in project `over-garden` (`list_deployments`, target `production`):

| Issue | Squash commit | Production deployment | State |
|---|---|---|---|
| OVE-468 | `616d8192` | `dpl_DZGocz8ZN7S9Hps4aB3DXsPuzaCM` | READY |
| OVE-469 | `1aa34d6f` | `dpl_GF8fq24z6hb9edNEv2aQ97h27NL6` (the URL its receipt named) | READY, production until OVE-478's release |
| OVE-497 | `f499f37e` | `dpl_CtTChXwGAgJybMyZxdgCDvXGAPmK` | READY |
| OVE-502 | `54fa3fff` | `dpl_DizJeGnwroF322xbVofMP5nfe1po` | READY |
| OVE-506 | `6d0e2ff3` | `dpl_HSZNJaSe3Y9ZosYAdCzrnaQCvjFi` | READY |
| OVE-467 #441 | `842a96b6` | none retrievable | — |
| OVE-467 #442 | `c098bd28` | none retrievable | — |

For #441 and #442 the API returns no deployment for the commit, and the id
recorded for #445 (`dpl_AQc2dp2GyMcoC2vUkB64aJZpoA4X`) now answers
`not_found`: deployments from 2026-09-22 are no longer kept. Both commits are
ancestors of every later production deployment (`git merge-base
--is-ancestor … 1aa34d6f` holds), so what they shipped has been in production
since at least `dpl_CPzA89nix95f2j1zVaaizYW2tdpG` (#446, 2026-09-22 20:49 UTC).
