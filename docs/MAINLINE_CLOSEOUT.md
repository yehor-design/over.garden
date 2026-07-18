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

| Issue                                                                                                                        | Required state before its dependent slice                                                                                            | Main proof                                 | CI proof                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [OVE-29](https://linear.app/overgarden/issue/OVE-29/owner-consistent-media-photo-can-only-attach-to-the-users-own-entry)     | Owner-consistent media attachment is in `main`; the earlier branch-only audit commit `27fc5f56` is superseded.                       | `4019df1bce770499c160fff4bca0c8603a2f2ee0` | [CI run 28381089559](https://github.com/yehor-design/over.garden/actions/runs/28381089559) |
| [OVE-30](https://linear.app/overgarden/issue/OVE-30/production-auth-fail-closed-no-deployed-app-runs-on-development-secret)  | Production auth fail-closed behavior is in `main`; the earlier branch-only audit commit `d6d47350` is superseded.                    | `e3bd3b4dfd4491d87529462ed1061bfb522b6e6a` | [CI run 28386343926](https://github.com/yehor-design/over.garden/actions/runs/28386343926) |
| [OVE-163](https://linear.app/overgarden/issue/OVE-163/deterministic-matching-rollout-proof-operator-verifies-suggestions)    | Deterministic matching behavior and its redacted local/production proof are in `main` before OVE-170 localization closeout.          | `e94148fa5a4a097422b5cdf7234e1b1ffad542e2` | [CI run 29477408972](https://github.com/yehor-design/over.garden/actions/runs/29477408972) |
| [OVE-170](https://linear.app/overgarden/issue/OVE-170/operator-localization-delta-add-locale-aware-admin-curation-pilot)     | Locale-aware operator surfaces and their redacted browser, fixture, accessibility, and build proof are in `main`.                    | `6c13dd798b2ee13dc2308edb687bb719dbb24aef` | [CI run 29526842637](https://github.com/yehor-design/over.garden/actions/runs/29526842637) |
| [OVE-171](https://linear.app/overgarden/issue/OVE-171/incremental-localization-completion-gate-prove-shipped-baseline-plus)  | The zero-gap localization inventory, mutation gates, browser matrix, exact-SHA deployment, and canonical smoke are proven.           | `035f2168872db666e0967e92707dfa8ced0f5036` | [CI run 29534312152](https://github.com/yehor-design/over.garden/actions/runs/29534312152) |
| [OVE-189](https://linear.app/overgarden/issue/OVE-189/canonical-local-media-runtime-an-agent-can-restart-minio-and-complete) | Canonical local media recovery, actual one-photo readback, restart persistence, and preserved-source safety are proven.              | `8efb396b81274a9eb0bed4bbca80619728c8d8e8` | [CI run 29606929190](https://github.com/yehor-design/over.garden/actions/runs/29606929190) |
| [OVE-190](https://linear.app/overgarden/issue/OVE-190/production-matching-parity-catalog-refresh-jobs-complete-on-the-exact) | Exact immutable API/worker parity, six-handler canary, capacity-safe install, A/B rollback/forward, and restart recovery are proven. | `14f5b9ce671f134847e556103b8d09e45cc76ed1` | [CI run 29640027651](https://github.com/yehor-design/over.garden/actions/runs/29640027651) |

There is no outstanding dependent localization closeout issue in this ledger. The OVE-51 -> OVE-52 -> OVE-53 sequence is the historical recovery order retained by the baseline entries above.

OVE-171 production proof used Vercel deployment `dpl_EJWtcF3nyyqN6VWVhTB9EtWKR67C`, which reached `READY` for the exact behavior commit and owned the canonical `over.garden` aliases. The redacted canonical smoke proved seven guest-readable directory routes, real public passport/journal/profile continuation, comment/follow/bookmark/create auth-intent boundaries, Production fixture refusal, clean sitemap/public HTML, no-store privacy, selected-locale foundations, and exact tested/deployed SHA equality. Cisco Umbrella reputation correction remains isolated to OVE-188 and does not invalidate the localization closeout.

OVE-189 behavior commit `f4a868741987f03e624471f3c0c4de5286f914c0` recovered the canonical local Apple Container MinIO runtime into the explicit `overgarden-minio-recovered-20260717-ove189` target; final baseline `8efb396b81274a9eb0bed4bbca80619728c8d8e8` also contains the CI environment-scope correction. The corrupt `overgarden-minio-data` source remains physically present and read-only-preserved with retirement not authorized. Bounded evidence proved an exact inventory/content match, a real quarantine-to-stripped-WebP media path, authenticated/public readback, original deletion, and persistence of Postgres, Meilisearch, MinIO, and visual fixtures across full container recreation. This closeout did not mutate production R2 or authorize retirement of the source volume.

OVE-190 implementation source `710ac0c74559cea698946be31eeea856f0644fb4` passed exact-main CI `29639178461` and produced two distinct immutable artifacts in matching-image runs `29639178486` and `29639190206`. Production API and worker run final release B with exact SHA/digest parity; all six handlers reached `done`, the public-safe journal search document was indexed, unindexed, and restored, rollback to release A and forward to B passed, and a worker restart recovered the same B identity and fresh heartbeat. Evidence baseline `14f5b9ce671f134847e556103b8d09e45cc76ed1` records the redacted live proof. A no-swap capacity freeze was recovered before activation; persistent low-swappiness swap, bounded low-priority archive operations, RAM/swap/disk gates, and pointer-aware obsolete-release cleanup were then live-proven without deleting volumes or production data.

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
