# MVP Posture Contract Alignment

Status: current repository authority for OVE-339
Classification schema: `ove339.postureCanonAlignment.v1`
Aggregate receipt schema: `ove339.postureCanonAlignmentAggregate.v1`
Reconciled baseline: `9686353809b1f443ebeb6b9d59478c2ea90f830e`
Reconciled on: 2026-08-25

## Outcome

The current posture sweep measures exactly 51 repository documents in its
declared documentation surface: 35 live authorities or preserved guardrails
and 16 immutable historical receipts. Each path is classified exactly once
below. The six high-reach live authorities received an applicability
clarification; the other 29 live documents retain their current control text,
and every historical receipt retains its exact pre-sweep SHA-256.

ADR-0018 remains the sole request-posture authority: its named unresolved reads
serve with the accepted cross-account-read exposure, public candidates use
`PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`, and admin capability stays inside
the account product under `AdminUserRole`. ADR-0019 supersedes the earlier
media topology: the browser-generated WebP is the sole final journal artifact.
Strict controls for positively resolved prohibitions, mutation authorization,
precise location, erasure, evidence integrity, accessibility, fixtures, and
operator proof remain active.

## Classification rule

A `live_authority` path can guide current execution. Its strict wording is
either explicitly reconciled to ADR-0018/ADR-0019 or classified as a preserved
control outside the retired uncertainty-serving/media/indexability posture.

A `historical_receipt` path records a completed decision, audit, baseline,
contract, or terminal runbook. Its source bytes are not edited. This ledger is
the historical label, and the pinned digest makes a later rewrite observable.

The product-research corpus and `docs/superpowers/` planning archive are
outside this measured sweep. Their exclusion is structural and deterministic;
it is not an assertion that their contents are current implementation authority.

## Machine-canon convergence

Before OVE-339, the broad OVE-329 classifier returned `aligned` while still
classifying 1,134 spans as `runtime_pending_child`, because its owner-state
snapshot remained at the pre-implementation program state. OVE-339 updates
terminal owner states, classifies the final docs/operator surfaces through this
ledger, and requires both the broad classifier and this exact ledger verifier
to report zero pending and zero forbidden/unclassified entries.

The verifier is read-only. Its process-local session has one active generation,
returns `scan_already_running` to a concurrent start, exposes synchronous
status and cancellation commands, fences late results after timeout or
cancellation, and uses a 600,000 ms maximum deadline. Its aggregate receipt
contains only schema/status, paths, classes, reason codes, counts, digests,
duration, repository SHA, and violation codes.

The terminal OVE-339 local receipt reported 33 live authorities, 16 historical
receipts, 33 reconciled paths, 16 ledger labels, zero unclassified paths, zero
pending runtime spans, and semantic digest
`c00dd488572b7af6029810ebbf26c5a2043498dd174293961bd39b14ea0e143f`.
Deterministic replay matched, and the injected dependency timeout reached the
bounded `timed_out` terminal state. OVE-254 later adds the classified live EPPO
capture runbook without rewriting that terminal receipt.

## Document ledger

| Path                                                                | Classification       | Reason                                  | Decision                                                                                                    |
| ------------------------------------------------------------------- | -------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/adr/ADR-0015-lexical-structured-journal-editor.md`            | `live_authority`     | `current_editor_adr_guardrail`          | current control preserved                                                                                   |
| `docs/adr/ADR-0017-online-only-product.md`                          | `live_authority`     | `current_connectivity_adr_guardrail`    | current control preserved                                                                                   |
| `docs/adr/ADR-0021-journal-deletion-retention.md`                   | `live_authority`     | `current_journal_deletion_retention_authority` | added by OVE-353; supersedes only the named journal archive clauses                     |
| `docs/architecture/AUTHENTICATED_ARCHITECTURE_INTEGRATION_PROOF.md` | `live_authority`     | `current_architecture_proof_guardrail`  | current control preserved                                                                                   |
| `docs/architecture/AUTHENTICATED_MUTATION_ADMISSION.md`             | `live_authority`     | `current_mutation_guardrail`            | ADR applicability clarified                                                                                 |
| `docs/audit-inbox/AGENT_GOVERNANCE_REDESIGN_2026-08-15.md`          | `historical_receipt` | `dated_audit_receipt`                   | immutable bytes ledger-labelled; SHA-256 `910e6c4126d77b976b71bceca7cba18ef4fc23208f8a20e22a6ca04f848e245a` |
| `docs/audit-inbox/OFFLINE_REMOVAL_AUDIT.md`                         | `historical_receipt` | `dated_audit_receipt`                   | immutable bytes ledger-labelled; SHA-256 `a7799e417f375b7ff7a325ab5f301bf068fa88447192c1876a71cf9b2d4ae1a0` |
| `docs/audit-inbox/STACK_REVALIDATION_2026-08-15.md`                 | `historical_receipt` | `dated_audit_receipt`                   | immutable bytes ledger-labelled; SHA-256 `aa90e1ad3bf6b0b71dbf95dafca304c5b38fce5c8c39866f2af588197d3c7ba6` |
| `docs/AUTHENTICATED_GOOGLE_LINK_CONTRACT.md`                        | `live_authority`     | `current_auth_provider_guardrail`       | current control preserved                                                                                   |
| `docs/CATALOG_ALIAS_SUGGESTION_REVIEW.md`                           | `live_authority`     | `current_catalog_guardrail`             | current control preserved                                                                                   |
| `docs/CATALOG_FULL_IMPORT_DRY_RUN.md`                               | `live_authority`     | `current_catalog_evidence_guardrail`    | current control preserved                                                                                   |
| `docs/CATALOG_GARDENER_TYPEAHEAD_READBACK.md`                       | `live_authority`     | `current_catalog_guardrail`             | current control preserved                                                                                   |
| `docs/CATALOG_MATCH_SUGGESTION_QUEUE.md`                            | `live_authority`     | `current_catalog_guardrail`             | current control preserved                                                                                   |
| `docs/CATALOG_SEED_ROLLOUT_PROOF.md`                                | `live_authority`     | `current_catalog_release_guardrail`     | current control preserved                                                                                   |
| `docs/CURRENT_SCHEMA_ERASURE.md`                                    | `live_authority`     | `current_erasure_guardrail`             | current control preserved                                                                                   |
| `docs/DRIVE2_PARITY_PRODUCTION_CLOSEOUT.md`                         | `live_authority`     | `current_release_guardrail`             | current control preserved                                                                                   |
| `docs/EPPO_OBSERVED_CAPTURE.md`                                     | `live_authority`     | `current_source_capture_guardrail`      | current control preserved                                                                                   |
| `docs/IDENTITY_POLICY.md`                                           | `live_authority`     | `current_identity_guardrail`            | current control preserved                                                                                   |
| `docs/INFRASTRUCTURE_REGISTRY.md`                                   | `live_authority`     | `current_infrastructure_guardrail`      | current control preserved                                                                                   |
| `docs/INTERFACE_LOCALE_CONTRACT.md`                                 | `live_authority`     | `current_locale_guardrail`              | current control preserved                                                                                   |
| `docs/LAUNCH_CORPUS.md`                                             | `live_authority`     | `current_launch_corpus_guardrail`       | ADR applicability clarified                                                                                 |
| `docs/LEGACY_DEVICE_DATA_RETIREMENT.md`                             | `live_authority`     | `current_retirement_guardrail`          | current control preserved                                                                                   |
| `docs/LEXICAL_STRUCTURED_JOURNAL_EDITOR_AUDIT.md`                   | `historical_receipt` | `ove317_baseline_receipt`               | immutable bytes ledger-labelled; SHA-256 `95dd903aa732bab28a3764c056882c6b56ed6d688bf96d67580313628b0818b8` |
| `docs/LINEAGE_SCOPE_DECISION.md`                                    | `live_authority`     | `current_lineage_guardrail`             | current control preserved                                                                                   |
| `docs/LINEAR_AI_EXECUTION_TASK_STANDARD.md`                         | `live_authority`     | `current_task_construction_authority`   | ADR applicability clarified                                                                                 |
| `docs/linear/ove-274-eppo-secure-credential-bootstrap.md`           | `live_authority`     | `current_pending_linear_contract`       | current control preserved                                                                                   |
| `docs/linear/ove-317-lexical-structured-journal.md`                 | `historical_receipt` | `completed_linear_contract`             | immutable bytes ledger-labelled; SHA-256 `a288e1574c30254b5f8e9aa8fdee86097726a2d6b4a13a615f1fdaae7b9c00a5` |
| `docs/LOCALIZATION_COVERAGE_BASELINE_2026-07-14.md`                 | `historical_receipt` | `localization_baseline_receipt`         | immutable bytes ledger-labelled; SHA-256 `fe73e0c74c3085ee9ce584ff46866639a0d3a6cc4e4f4a3a80d23943e1ce3bee` |
| `docs/LOCALIZATION_COVERAGE_WORKFLOW.md`                            | `live_authority`     | `current_locale_coverage_guardrail`     | current control preserved                                                                                   |
| `docs/MAINLINE_CLOSEOUT.md`                                         | `live_authority`     | `current_delivery_guardrail`            | ADR applicability clarified                                                                                 |
| `docs/MVP_LEARNING_SIGNALS.md`                                      | `live_authority`     | `current_learning_guardrail`            | current control preserved                                                                                   |
| `docs/MVP_SCOPE_RECHECK_2026-07-03.md`                              | `live_authority`     | `current_scope_authority`               | current control preserved                                                                                   |
| `docs/PUBLIC_IDENTITY_MIGRATION_RUNBOOK.md`                         | `historical_receipt` | `completed_migration_runbook`           | immutable bytes ledger-labelled; SHA-256 `6da194518ff5fa89d628ed1c4ca747d31586506be57641464e08b85f654a72e4` |
| `docs/PUBLIC_JOURNAL_INDEX_PARITY.md`                               | `live_authority`     | `current_search_parity_guardrail`       | ADR applicability clarified                                                                                 |
| `docs/PUBLIC_SEO_AEO_SURFACE_POLICY.md`                             | `live_authority`     | `current_discovery_threshold_guardrail` | current control preserved                                                                                   |
| `docs/reviews/2026-06-27-whole-repo-review.md`                      | `historical_receipt` | `dated_review_receipt`                  | immutable bytes ledger-labelled; SHA-256 `f1143605841c4bcf3ad2637dcb99b3ea8e2b98592d4516ac564dc1a8785126ff` |
| `docs/runbooks/OVE_303_FINAL_MAIN_PUBLIC_JOURNAL_SSR.md`            | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `af50d370d4087fde7d93a59eee0ca7816e79671a9ad0ec4249acb8d6d7f6a47e` |
| `docs/runbooks/OVE_304_FINAL_MAIN_ARCHIVE_410.md`                   | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `aa2d5af3be30274943b9f0d7c2b027262a2dc693950ebe65f53e7d9e1c3f0fc8` |
| `docs/runbooks/OVE_306_FINAL_MAIN_JOURNAL_WORKER.md`                | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `6e8af1730247ac1a2026824915638d6b18029223c3c34fabe24ff7134f93ef3d` |
| `docs/runbooks/OVE_310_LAUNCH_WORKER_RESTART_RECOVERY.md`           | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `7764e37c12c5ed6d6a96b534af9be0d47bbcaad25ec0c6077855e5e2d57f2c1f` |
| `docs/runbooks/OVE_313_FINAL_MAIN_RESEND_DELIVERY.md`               | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `cd86aba671417fe673190a807c837b34090bdf34432c121ac758280da3d42499` |
| `docs/runbooks/OVE_314_OBSOLETE_CONTROL_PLANE_RETIREMENT.md`        | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `27a639197f1a4158167c39cf191e1a11be5df4a6a7c9f97b0d3e203afeb09182` |
| `docs/runbooks/OVE_316_R2_PATH_STYLE_RECOVERY.md`                   | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `1bd2988c2bc665b3f5e9d27218a519b08c6caf728b29998998c5bee17cf7cf4d` |
| `docs/runbooks/OVE_350_LEGACY_QUARANTINE_PROVIDER_RETIREMENT.md`    | `historical_receipt` | `terminal_runbook_receipt`              | immutable bytes ledger-labelled; SHA-256 `337d47945dcf7af83bd15514a3f997aa302f711e73f0463ec4d31a9fb7887390` |
| `docs/SDD_VERTICAL_SLICE_ROADMAP.md`                                | `live_authority`     | `current_execution_roadmap`             | ADR applicability clarified                                                                                 |
| `docs/SESSION_LOCALE_CONVERGENCE.md`                                | `live_authority`     | `current_session_locale_guardrail`      | current control preserved                                                                                   |
| `docs/STRUCTURED_JOURNAL_COMPOSER.md`                               | `live_authority`     | `current_journal_document_guardrail`    | current control preserved                                                                                   |
| `docs/SUBJECT_AWARE_MEDIA.md`                                       | `live_authority`     | `current_media_presentation_guardrail`  | current control preserved                                                                                   |
| `docs/TYPOGRAPHY_CONTRACT.md`                                       | `live_authority`     | `current_typography_guardrail`          | current control preserved                                                                                   |
| `docs/VISUAL_FIXTURE_ENVIRONMENT.md`                                | `live_authority`     | `current_fixture_guardrail`             | current control preserved                                                                                   |
| `docs/WALKING_SKELETON.md`                                          | `live_authority`     | `current_stack_skeleton`                | current control preserved                                                                                   |

## Saved Linear contract reconciliation

OVE-341 already reconciled its exact fifteen owned non-terminal contracts and
closed with zero live instructions. OVE-343 and OVE-344 then classified the
eight-card validation cohort without rewriting terminal issue history.
OVE-342 was materially corrected and closed before this sweep.

OVE-339 stopped on its stale 2026-08-19 enumeration, repinned execution to
current main, and saved a validated 49-document contract. The local raw body
passed with SHA-256
`938330840c041207b6f520aa1a5de13e34473266639cefe712bb8585780aac5a`;
the authenticated Linear-normalized body passed with SHA-256
`c69329e4890b371f081bd99f4a943455971fe76b37970085de5e7c25f85d6a8e`.
Terminal issue bodies remain historical receipts. The final OVE-339 read-back,
implementation containment, and terminal status are delivery evidence rather
than repository-doc claims.

## Scope and non-claims

OVE-339 changes documentation, posture verification classification, verifier
tests, the online-only classification entries for its two new proof paths, and
the authenticated status snapshot only. It changes no application runtime,
route, schema, migration, application test expectation, provider resource,
production data, product behavior, or accepted ADR. One revert restores the
prior repository canon.
