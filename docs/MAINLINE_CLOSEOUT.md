# Mainline Closeout Guard

Status: active guardrail
Started by: OVE-50
Canonical machine-readable ledger: `docs/mainline-closeout-ledger.json`
Check command: `cd apps/web && pnpm mainline:closeout:check`

## Why This Exists

Linear `Done` is not enough for OverGarden. During the 2026-06-29 audit, OVE-29 and OVE-30 had valid branch closeout comments, but those branch commits were not contained in the `main` checkout that the next agent would use. That creates a worse product risk than an ordinary missing feature: every later slice can be built on a false baseline.

This guard makes the next-agent starting point explicit:

1. Read this document.
2. Run `cd apps/web && pnpm mainline:closeout:check`.
3. Only continue to the next Linear issue when the required closeout entries are contained in current `main` or in an explicitly named deployed commit.

## Current Required Proofs

| Issue                                                                                                                        | Required state before its dependent slice                                                                                                                                                                                                                                                       | Main proof                                 | CI proof                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [OVE-29](https://linear.app/overgarden/issue/OVE-29/owner-consistent-media-photo-can-only-attach-to-the-users-own-entry)     | Owner-consistent media attachment is in `main`; the earlier branch-only audit commit `27fc5f56` is superseded.                                                                                                                                                                                  | `4019df1bce770499c160fff4bca0c8603a2f2ee0` | [CI run 28381089559](https://github.com/yehor-design/over.garden/actions/runs/28381089559) |
| [OVE-30](https://linear.app/overgarden/issue/OVE-30/production-auth-fail-closed-no-deployed-app-runs-on-development-secret)  | Production auth fail-closed behavior is in `main`; the earlier branch-only audit commit `d6d47350` is superseded.                                                                                                                                                                               | `e3bd3b4dfd4491d87529462ed1061bfb522b6e6a` | [CI run 28386343926](https://github.com/yehor-design/over.garden/actions/runs/28386343926) |
| [OVE-163](https://linear.app/overgarden/issue/OVE-163/deterministic-matching-rollout-proof-operator-verifies-suggestions)    | Deterministic matching behavior and its redacted local/production proof are in `main` before OVE-170 localization closeout.                                                                                                                                                                     | `e94148fa5a4a097422b5cdf7234e1b1ffad542e2` | [CI run 29477408972](https://github.com/yehor-design/over.garden/actions/runs/29477408972) |
| [OVE-170](https://linear.app/overgarden/issue/OVE-170/operator-localization-delta-add-locale-aware-admin-curation-pilot)     | Locale-aware operator surfaces and their redacted browser, fixture, accessibility, and build proof are in `main`.                                                                                                                                                                               | `6c13dd798b2ee13dc2308edb687bb719dbb24aef` | [CI run 29526842637](https://github.com/yehor-design/over.garden/actions/runs/29526842637) |
| [OVE-171](https://linear.app/overgarden/issue/OVE-171/incremental-localization-completion-gate-prove-shipped-baseline-plus)  | The zero-gap localization inventory, mutation gates, browser matrix, exact-SHA deployment, and canonical smoke are proven.                                                                                                                                                                      | `035f2168872db666e0967e92707dfa8ced0f5036` | [CI run 29534312152](https://github.com/yehor-design/over.garden/actions/runs/29534312152) |
| [OVE-188](https://linear.app/overgarden/issue/OVE-188)                                                                       | Protective-DNS detection is in `main`; A1 and Cisco resolver parity, the normal-browser path, and bounded security checks are proven.                                                                                                                                                           | `23d0933c0a59cb18103773f3715fee7ebdf18f32` | [CI run 29600224703](https://github.com/yehor-design/over.garden/actions/runs/29600224703) |
| [OVE-189](https://linear.app/overgarden/issue/OVE-189/canonical-local-media-runtime-an-agent-can-restart-minio-and-complete) | Canonical local media recovery, actual one-photo readback, restart persistence, and preserved-source safety are proven.                                                                                                                                                                         | `8efb396b81274a9eb0bed4bbca80619728c8d8e8` | [CI run 29606929190](https://github.com/yehor-design/over.garden/actions/runs/29606929190) |
| [OVE-190](https://linear.app/overgarden/issue/OVE-190/production-matching-parity-catalog-refresh-jobs-complete-on-the-exact) | Exact immutable API/worker parity, six-handler canary, capacity-safe install, A/B rollback/forward, and restart recovery are proven.                                                                                                                                                            | `14f5b9ce671f134847e556103b8d09e45cc76ed1` | [CI run 29640027651](https://github.com/yehor-design/over.garden/actions/runs/29640027651) |
| [OVE-203](https://linear.app/overgarden/issue/OVE-203/automatic-pseudonymous-handle-gardener-signs-up-without-a-name-and)    | Automatic non-PII identity, moderated rename lifecycle, migration, exact deployment, and redacted canonical runtime flow are proven.                                                                                                                                                            | `1edffc351c1c3132f97608083b4b6ea6a63e9a12` | [CI run 29652693020](https://github.com/yehor-design/over.garden/actions/runs/29652693020) |
| [OVE-204](https://linear.app/overgarden/issue/OVE-204/reliable-account-sign-out-gardener-safely-ends-the-current-session)    | Current-session-only sign-out, owner-scoped local-work guard, cross-tab convergence, continuity, and exact production proof are complete.                                                                                                                                                       | `31954a11f8405a9b125e3ea67963bb0ce963b5f3` | [CI run 29661780233](https://github.com/yehor-design/over.garden/actions/runs/29661780233) |
| [OVE-205](https://linear.app/overgarden/issue/OVE-205/market-aware-interface-language-control-ukraine-stays-uk-only-while)   | Market-first Ukraine/Bulgaria locale resolution, zero/exactly-one shared control ownership, safe switching and preference mutation, current-state coordination, fail-closed lifecycle coverage, and exact production proof are complete; downstream real-UI proof remains with OVE-202/206/207. | `b6145c1a3c176df5ef8634961b5d5642d5b87cbf` | [CI run 29931973816](https://github.com/yehor-design/over.garden/actions/runs/29931973816) |
| [OVE-208](https://linear.app/overgarden/issue/OVE-208/global-google-sans-typography-every-visitor-reads-a-consistent-fast) | Shared Google Sans proportional typography, same-origin immutable WOFF2, raw lifecycle font parity (including locale-prefixed object passports), privacy/no-CDN proof, and production READY exact-SHA evidence are complete; GitHub-hosted Actions remain budget-frozen to `workflow_dispatch`. | `6eb978ba46094fb7b85ecd8546838f7e1203b5f3` | Budget freeze: Vercel `dpl_321BfqUoZeJAnttDKewbM99DP4o3` READY + local typography/lifecycle gates |
| [OVE-202](https://linear.app/overgarden/issue/OVE-202) | Structured journal `JournalDocumentV1`, Editor.js owner composers (≤10 inline photos), edit/conflict receipts, offline multi-intent sync, and SSR renderer are on `main` with exact-SHA Vercel READY; founder physical iPhone Safari checklist confirmed. | `597f301203193fdb7749f57dc2c22ea3137ebc88` | Budget freeze: Vercel `dpl_A45oWncnSHncWwnfgvDQ8LDJmKwx` READY + local smoke/lint/typecheck/full test |
| [OVE-206](https://linear.app/overgarden/issue/OVE-206/accessible-story-block-reordering-gardener-drags-or-moves-every) | Accessible pointer/touch/keyboard block reorder via `blocks.move`, locale in-flight gesture fence, live-region/focus, 100-block/10-image identity, and `browser-backed` scenario `pointer-commit-immediate-transition` are on `main` with exact-SHA Vercel READY; Linear Done accepted after automated gates (physical iPhone checklist remains residual operator smoke). | `c06fa2ce30d473ae591453e24c09bc949cc1dae6` | Budget freeze: Vercel `dpl_DB1wi9J1AVpLb8JAxX11aqxEKbkg` READY + local smoke/lint/typecheck/full test |

OVE-205 is now the stable mainline prerequisite for OVE-202, OVE-193, and OVE-186. OVE-208 is the shared typography prerequisite for OVE-202/206/207. OVE-202 and OVE-206 closeouts do not satisfy the cover gates owned by OVE-207. The OVE-51 -> OVE-52 -> OVE-53 sequence is the historical recovery order retained by the baseline entries above.

OVE-171 production proof used Vercel deployment `dpl_EJWtcF3nyyqN6VWVhTB9EtWKR67C`, which reached `READY` for the exact behavior commit and owned the canonical `over.garden` aliases. The redacted canonical smoke proved seven guest-readable directory routes, real public passport/journal/profile continuation, comment/follow/bookmark/create auth-intent boundaries, Production fixture refusal, clean sitemap/public HTML, no-store privacy, selected-locale foundations, and exact tested/deployed SHA equality. The Cisco Umbrella mismatch recorded during that historical closeout was isolated to OVE-188 and did not invalidate localization proof.

OVE-188 behavior commit `23d0933c0a59cb18103773f3715fee7ebdf18f32` added the deterministic protective-DNS contract and passed exact-SHA CI `29600224703`. On 2026-07-22 the closure was refreshed against `main` baseline `0b7ac6c294894791b20d9998a6f7e6856130240d`: CI `29662442419` passed, Vercel deployment `dpl_4JqRWGXLEQLstKKk9877f39mTRPS` was `READY` for that SHA and owned apex plus `www`, and the resolver matrix returned `14 pass / 0 mismatch / 0 error`. A fresh normal browser on the default A1 connection rendered both canonical hostnames without a workaround or block page; TLS, canonical routes, the refreshed production dependency audit, and bounded error/HTTP-500 log checks also passed. One provider case was resolved while a related dashboard case remained asynchronous and received a redacted follow-up; no private case identifier is recorded. OVE-188 is closed as `false-positive remediation propagated / customer path recovered` and no longer blocks OVE-186, which must still rerun every release gate against its own final SHA.

OVE-189 behavior commit `f4a868741987f03e624471f3c0c4de5286f914c0` recovered the canonical local Apple Container MinIO runtime into the explicit `overgarden-minio-recovered-20260717-ove189` target; final baseline `8efb396b81274a9eb0bed4bbca80619728c8d8e8` also contains the CI environment-scope correction. The corrupt `overgarden-minio-data` source remains physically present and read-only-preserved with retirement not authorized. Bounded evidence proved an exact inventory/content match, a real quarantine-to-stripped-WebP media path, authenticated/public readback, original deletion, and persistence of Postgres, Meilisearch, MinIO, and visual fixtures across full container recreation. This closeout did not mutate production R2 or authorize retirement of the source volume.

OVE-190 implementation source `710ac0c74559cea698946be31eeea856f0644fb4` passed exact-main CI `29639178461` and produced two distinct immutable artifacts in matching-image runs `29639178486` and `29639190206`. Production API and worker run final release B with exact SHA/digest parity; all six handlers reached `done`, the public-safe journal search document was indexed, unindexed, and restored, rollback to release A and forward to B passed, and a worker restart recovered the same B identity and fresh heartbeat. Evidence baseline `14f5b9ce671f134847e556103b8d09e45cc76ed1` records the redacted live proof. A no-swap capacity freeze was recovered before activation; persistent low-swappiness swap, bounded low-priority archive operations, RAM/swap/disk gates, and pointer-aware obsolete-release cleanup were then live-proven without deleting volumes or production data.

OVE-203 behavior commit `1edffc351c1c3132f97608083b4b6ea6a63e9a12` was CI-proven before its additive production schema expansion and then deployed unchanged through `main`. Production migration converged from `64` users, `6` profiles/current claims, and `58` missing identities to `64`/`64`/`64`, with rollback proof unchanged, the second apply at zero mutations, and every integrity/review counter at zero. Vercel deployment `dpl_5bTNKAWqQJVctuBkESjg7bqVKgsL` reached `READY` and owned the canonical alias. A bounded redacted synthetic flow proved no-name signup, duplicate preservation, automatic handle, verified sign-in, immediate rename, cooldown, current `200`, retired `410`/`noindex` without redirect, and current/retired mention behavior; cleanup restored the same `64`/`64`/`64` zero-gap aggregate state.

OVE-204 behavior commit `31954a11f8405a9b125e3ea67963bb0ce963b5f3` passed exact-SHA CI, including the full web/Python suites, production build, localization coverage, and responsive accessibility matrix; matching-image release run `29661780225` also passed on the same revision. Vercel deployment `dpl_3Qu9hvUGn6KdCqbxgEZbZf7nDqaJ` reached `READY` and owned `over.garden` and `www.over.garden`. Bounded production smoke proved two independent sessions, exactly-current-session revocation, denial of old garden/profile/admin/mutation access, preservation of the other session and all server identity/provider/role/garden records, successful reauthentication continuity, and zero synthetic residue. A real credential owner session proved the profile and operator controls, no-draft fast path, hard localized redirect, cross-tab private-tree closure, and protected-route guest state. Google and Facebook production authorization starts reached the provider consent boundary and returned the deliberate existing-account collision fallback without silently linking the credential-only owner; the canonical sign-out boundary itself is provider-neutral and the production smoke preserved credential, Google, and Facebook link classes.

OVE-205 behavior commit `b6145c1a3c176df5ef8634961b5d5642d5b87cbf` passed exact-SHA CI `29931973816` and matching-image release `29931974101`. Vercel deployment `dpl_719iz4kshXu7zrk5qzYXwQ3CmFUA` reached `READY`, was GitHub-verified, and served the canonical aliases plus immutable URL `https://over-garden-qda7r8e4b-yehors-projects-01221e2b.vercel.app`. The fresh schema-v3 browser artifact proved `171` scenarios, `642` page checks across eight viewports, `136` Axe checks, `732` route contracts, `90` owner probes, `90` market cases, `90` control contracts, and all `23` interaction outcomes. Full verification also passed `356` test files and `2256` tests, generated types for `57` tables, lint, typecheck, visual fixtures, and production build.

OVE-208 ships the shared Google Sans proportional contract on `main`, including same-origin content-hashed WOFF2 under `/fonts/`, shared lifecycle HTML font ownership, and a focused Chromium/Firefox/WebKit typography gate. During closeout, GitHub-hosted Actions hit a spending freeze, so auto CI triggers were paused to `workflow_dispatch` and the temporary merge gate became Vercel `READY` for the exact SHA plus local typography/lifecycle proof. An audit follow-up then fixed locale-prefixed object-passport raw lifecycle matching (`/bg|/ru/lineage/objects/...`) so those paths emit the same noindex/no-store Google Sans documents as unprefixed passports, communities, journals, and profiles. Exact SHAs and Vercel deployment ids live in `docs/mainline-closeout-ledger.json`.

Redacted production proof separated observed facts from compositional guarantees. A fresh browser on the default A1 Bulgaria connection reached `/bg` from apex and `www`, returned `lang` and `Content-Language` `bg`, rendered exactly one visible shared control, and completed a real `bg` to `ru` switch. Two independent Ukraine egress nodes returned the Ukraine-only root `200` on the immutable exact-SHA deployment while a Bulgaria node returned the expected `/bg` redirect; exact-SHA candidate-browser evidence separately proved the resulting Ukraine `lang=uk` and zero-control body invariant. Protective-DNS parity passed `14/14`. A redacted real database-backed archived journal returned hard `410`, `noindex,nofollow`, `private,no-store`, Bulgarian document language, and exactly one control on both canonical and immutable exact-SHA hosts. No slug, identity, IP address, city, cookie, user agent, private content, or secret was recorded.

The payload-free `owner-composer-drafts` registration remains the shared OVE-205 extension seam. OVE-202 records `browser-backed` proof with scenario `editor-clean-locale-transition` and `proofOwner: OVE-202`. OVE-206 records `browser-backed` proof with scenario `pointer-commit-immediate-transition` and `proofOwner: OVE-206`. OVE-207 remains `downstream-owned-real-ui` with `browserScenarioId: null` until its own closeout.

## Closeout Rule For Future Issues

Every future Linear SDD issue must leave a closeout comment that proves the shipped behavior on a trustworthy baseline. A feature-branch SHA alone is not proof.

Required closeout evidence:

- Linear issue id and title.
- Commit SHA on `main`, or an explicitly named deployed commit when production deployment is the source of truth.
- Branch/ref used for proof.
- Main containment proof, for example:

```bash
git branch --contains <completed-issue-sha>
git merge-base --is-ancestor <completed-issue-sha> HEAD
git merge-base --is-ancestor <completed-issue-sha> origin/main
```

- Verification commands that passed.
- CI run URL for the commit that future agents will build on.
- Deployment id, public URL, and redacted smoke evidence when the issue touches live production behavior.
- A statement that no secrets, invite URLs, journal text, media keys, raw request metadata, live user identifiers, or precise location data were included in the evidence.

Use this Linear closeout template:

```markdown
Mainline closeout:

- Issue:
- Commit on main or deployed commit:
- Ref/branch:
- Containment proof:
- Local verification:
- CI/deployment proof:
- Live smoke proof, if relevant:
- Redaction/privacy note:
```

## Failure Gates

Do not mark a Linear issue `Done` when any of these are true:

- The only cited commit exists on a feature branch and is not contained in current `main`.
- `origin/main` or the deployed commit has not been verified after the final fix.
- The proof omits CI/build status for the exact baseline the next agent will use.
- Live smoke evidence includes secrets, invite URLs, raw journal content, media storage keys, exact location, raw request metadata, emails, IP addresses, user agents, or user identifiers.
- The next agent can still follow stale roadmap/status text into an older execution batch instead of the current Linear queue.

## Ledger Maintenance

`docs/mainline-closeout-ledger.json` tracks critical closeout entries that must be machine-checked before the next agent continues. It is intentionally small; it is not a full release log.

Add or update a ledger entry when:

- A recently completed issue is a blocker for the next Linear slice.
- A prior closeout was proven only on a branch and later receives a superseding `main` commit.
- Production deployment containment is more important than local `main` containment.

The CI job runs `pnpm mainline:closeout:check`, which verifies required ledger entries are structurally valid and contained in the checked-out `main` history.
