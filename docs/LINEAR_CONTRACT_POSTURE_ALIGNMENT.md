# Linear contract posture alignment

Status: accepted
Owner: OVE-341
Authority: `docs/adr/ADR-0018-mvp-posture.md`
Instrument: `ove341.linearContractPosture.v1`
Export schema: `ove341.linearContractExport.v1`

## Outcome

OVE-341 owns exactly fifteen Backlog descriptions from the online-only and
Stable Registry programs. It does not own their statuses, relation edges,
projects, milestones, labels, priorities, estimates, or implementation. The
alignment changes the posture an eventual executor reads while preserving the
work each contract already owns.

The posture declaration added to each owned body is explicitly not additional
scope. It names ADR-0018 as the current MVP posture and defines the four current
interpretations: serve under uncertainty with the accepted cross-account-read
exposure, format-conversion-only WebP delivery, threshold-driven public
indexability, and in-product admin under `AdminUserRole`. Positively resolved
prohibitions and the precise-location lock remain enforced.

`docs/MVP_POSTURE_CONTRACT_ALIGNMENT.md` is not created here. That successor
record and repository-authority sweep remain owned by OVE-339.

## Closed classification contract

Every candidate clause resolves to exactly one class:

- `live_instruction`: non-terminal prose that instructs an executor to apply a
  posture superseded by ADR-0018. The body is corrected.
- `recorded_measurement`: historical, completed-run, existing-runtime, research,
  or provenance evidence. Its original wording is retained; its receipt class is
  the historical label.
- `already_aligned`: the clause already states ADR-0018 behavior or protects a
  boundary ADR-0018 did not retire, including precise-location containment,
  source-ingestion quarantine, evidence hygiene, and positively resolved
  prohibitions.
- `out_of_scope`: a contract or clause owned by OVE-339. Its bytes are untouched
  and the receipt names OVE-339.

Wrapped Markdown list items are classified independently: the next bullet or
numbered item closes the prior clause. This prevents a historical phrase in one
item from masking a live instruction in its neighbor.

A terminal `Done` or `Canceled` contract is always classified as recorded
measurement and is byte-preserved. An unclassified clause, stale description
digest, incomplete owned set, duplicate identifier, held scan lock,
cancellation, or deadline breach stops the run without a Linear write.

## Measured receipts

| Phase                                | Status               | Contracts | Live | Recorded | Aligned | Out of scope | Duration | Digest                                                             |
| ------------------------------------ | -------------------- | --------: | ---: | -------: | ------: | -----------: | -------: | ------------------------------------------------------------------ |
| Before                               | `alignment_required` |        15 |   72 |        7 |      45 |            0 |    13 ms | `12a239f363230c155eed5132aa644b65bf21cba9a8291dafaf1fd8427f1ef363` |
| Corrected export and saved read-back | `aligned`            |        15 |    0 |        9 |     130 |            0 |    13 ms | `60d6002c0ff98cbd61b5dafe745ea09eda7a94d47afbddc471258b2c22470d95` |

The receipt includes the identifier, line anchor, class, and reason for every
candidate clause while excluding body text. The same export produces the same
classification digest. The corrected export also produces zero second edit.

## Per-contract digest and classification ledger

Counts use `live/recorded/aligned`. Every issue was `Backlog` at export.

| Contract | Before SHA-256                                                     |   Before | Corrected SHA-256                                                  | Corrected |
| -------- | ------------------------------------------------------------------ | -------: | ------------------------------------------------------------------ | --------: |
| OVE-250  | `b5afa1ec420c7da8b410cb81a9161c706bb4baf6741d4c2cce1f06ab854b701c` |  `0/0/1` | `4af184e49fa12b1317dbfabf0764be3ebcc247e7fcadb5b4bbe86e62408df9a9` |   `0/0/2` |
| OVE-254  | `a6d9f8ebbee6b606b35a5339a297326619dbc9c65a72b4475a8c02237c26b5f8` |  `3/1/2` | `efe6847d3ac4a1ef06bfcc1cf7b8c3beb3272f215f42601ee95f6d990fe11b04` |   `0/1/6` |
| OVE-255  | `f5afc987b54cdb4bbfa206eab31c74ed8d02dd48efa3f65a3a495ead0e6a9a75` |  `3/0/1` | `49e05ec9da0d0194c448d4b6514bf43f96061a973ac2f2348f19b5a28fb665f3` |   `0/0/6` |
| OVE-256  | `25c2078acffedd6a316e77301c32922fb34e10206d232e11dc557e650d5600ea` | `15/1/1` | `76c758c7b56b8bc7d248b513d8de7810bde8b23843de6dc23befdbf3c84088f5` |  `0/2/13` |
| OVE-257  | `76e0a2f4fc9d7ab4e71a4b5c10821a035c7730891d3033e351cbea26c1aee532` |  `3/0/1` | `52c0d2f38d968f37bda63347575b4813f49241b73dcaca1085b6bcfe3e9b7b3e` |   `0/0/6` |
| OVE-258  | `d8786b323d8d5dce3774157c8b09adb932166a1315b49be9e9a26920e4ab63eb` |  `3/1/1` | `b93fb92b1b7b21ebe2380d2fe08e9c7fc7ba80a79688c8456a608687325f015f` |   `0/1/5` |
| OVE-259  | `cc3bbb774a083dc6db5872f64df76cedefe55aff4db0c98865a7050dab0d1bfa` |  `3/1/2` | `fc84e9d67c0cb455191cf49f1d7d60fc90954601ef7b9bdcdceaad3d822c90d8` |   `0/1/6` |
| OVE-321  | `7ecaa04db1ef4435809d893443e7b067cae6c927192917f7d81497c9bded3c19` | `13/0/5` | `ee6f820566c04a06e59bec90e559e6f6283e2242234d072888b7003ca1edeb4f` |  `0/1/19` |
| OVE-322  | `61c5a7626ad44b55de7f9684551e46ee850cad688ee652fd743bb227c9ae6469` | `6/0/15` | `e9f8b202fb35cba2b61ce55d859eb0df85bc86921441995ed13b78d863b3deb5` |  `0/0/22` |
| OVE-323  | `25949cdc9ccff61dc5a5c0774ebdd161858aaea56131893d7437710dee5452ce` |  `3/0/6` | `b6b2ed284de9727a2ee5d4a062b33c961c83e0673c963db993d52019d773c286` |  `0/0/10` |
| OVE-324  | `30ca7f450513153ce072edf27ad0e7df2efc26ed70bb6aa793d99c6c2d4ebf6f` |  `0/0/1` | `da24687af6a78970f3b2e915fde17d7eafc735dffba0f679586a27047f619002` |   `0/0/2` |
| OVE-325  | `484bf1a5a9571f6bd3cc99b5a91e4935fca78edd4821df8adb152551d49ec0a5` |  `8/0/2` | `49f0016b8161dc08e00d7fd7d471cb6c43f2eeb4933da3f70fbc957ff24fc3e6` |  `0/0/11` |
| OVE-326  | `ee2487c98f89ae875c847c89c1a190aa56e4a0418a869b3ab4132383f36bd515` |  `5/1/5` | `ede6eae3c23af021b622a13ca480005b2bd550aa04fab69db6afff8cc998826a` |  `0/1/11` |
| OVE-327  | `17219aadb905bc217ed24652abaae911c3975de705a73952db65a7d503682a40` |  `4/1/1` | `c34b657452f06c9d11f9274bfde91ad8f5b12243acac49f7e1d661da850cffa6` |   `0/1/6` |
| OVE-328  | `3070d3e87232df4ae2865a4542df96106c7ade1a49eae0ec7c5f20d6ff645a36` |  `3/1/1` | `e8f8338ea021c7acc61c356e901e3ce24a488328988508d290d8918f89ea9b04` |   `0/1/5` |

## Decision ledger

| Contract | Decision                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OVE-250  | Already aligned coordination contract; add the current posture authority and ADR-0018 context only.                                                                                                                                                                                             |
| OVE-254  | Replace stale-public-projection refusal and blanket authorization denial with threshold/quality-class and resolved-versus-unresolved behavior; preserve source-ingestion quarantine and evidence controls.                                                                                      |
| OVE-255  | Apply the same projection and authorization distinction to release construction; keep positive curator and eligibility prohibitions.                                                                                                                                                            |
| OVE-256  | Replace blanket `noindex` instructions with `PUBLIC_SURFACE_INDEXABILITY_THRESHOLD`; retain the original SEO-research sentence under an explicit historical-measurement label.                                                                                                                  |
| OVE-257  | Distinguish positively resolved owner/session prohibitions from unresolved serving and replace stale-public-projection refusal; keep active-release and kind predicates.                                                                                                                        |
| OVE-258  | Replace stale-public-projection refusal and blanket authorization denial; keep immutable edition, activation, and rollback rules.                                                                                                                                                               |
| OVE-259  | Replace stale-public-projection refusal and blanket authorization denial; keep explicit production-plan approval as a positively resolved mutation gate.                                                                                                                                        |
| OVE-321  | Reconcile draft authorization, media delivery, and public projection language; label the preserved pre-ADR-0018 runtime observation as historical; pin ADR-0017 then ADR-0018 in current context and repin the contract baseline to the contained OVE-329 main.                                 |
| OVE-322  | Reconcile media and authorization language; add ADR-0017/ADR-0018 context, `pnpm online-only:canon:check` to the first verification block, the exact canon-drift failure gate, and the current `local-retirement` vocabulary required by the validator. No existing verification command moved. |
| OVE-323  | Reconcile authorization, media, and projection language; pin current ADR-0017/ADR-0018 context and current-main baseline while preserving historical artifacts byte-for-byte.                                                                                                                   |
| OVE-324  | Already aligned coordination container; add current ADR-0017/ADR-0018 context and repin its read baseline. It remains a zero-effect container.                                                                                                                                                  |
| OVE-325  | Reconcile composer authorization and media language; pin current ADR-0017/ADR-0018 context and current-main baseline.                                                                                                                                                                           |
| OVE-326  | Reconcile steady-state authorization, media, and projection language; pin current ADR-0017/ADR-0018 context and current-main baseline.                                                                                                                                                          |
| OVE-327  | Distinguish resolved source authorization from uncertainty and replace stale-public-projection refusal; preserve source-family rights quarantine.                                                                                                                                               |
| OVE-328  | Replace stale-public-projection refusal and blanket authorization denial; preserve parent binding, source rights, and extension-pack approval.                                                                                                                                                  |

## Structural and ownership proof

The transformer preserves all headings; `INV-*`, `AC-*`, `VER-*`, `PERF-*`, and
`WAIT-*` identifiers; table row owners and column shapes; existing fenced
commands; and task thresholds. The sole command addition is the inherited
OVE-320 canon gate in OVE-322's first verification block. OVE-322's existing
package-command row is extended to name that inherited owner; no row or existing
command moves. Online-only metadata and pinned evidence are repinned to
`021c20610bce4a40e7669bd3adc3375186984239`, the current contained main that
actually contains ADR-0017 and ADR-0018.

All fifteen raw corrected bodies and their byte-identical saved read-backs pass
`pnpm linear:task:check -- --file <body> --phase final`.

OVE-318, OVE-320, and OVE-339 are outside the writable set. Their descriptions,
statuses, and relations are fenced before the first write and read back after the
last write. No repository authority document owned by OVE-339 is changed.

## Saved Linear read-back

The single-writer sequence fenced all nineteen observed issues, then saved only
the fifteen owned descriptions in bounded batches. An immediate authenticated
read-back followed every save, and a second authenticated read-back followed the
last save. Every saved description is byte-identical to its corrected export and
therefore to the corrected SHA-256 value above. The saved set reproduces the
`aligned` receipt digest
`60d6002c0ff98cbd61b5dafe745ea09eda7a94d47afbddc471258b2c22470d95`
with zero violations and zero second edit.

All fifteen issues remain `Backlog`. Every status, relation, project, milestone,
label, priority, estimate, assignee, parent, attachment, and document field is
unchanged; only each description and Linear's corresponding automatic
`updatedAt` value changed. The nineteen-node in-scope relation read-back contains
26 directed blocking edges and zero cycles.

The OVE-318, OVE-320, OVE-339, and OVE-341 fences stayed byte-for-byte unchanged
through the final read-back: OVE-318 remained `Done`, OVE-320 and OVE-341 remained
`In Progress`, and OVE-339 remained `Backlog`. No status or relation was written
as part of the alignment.

## Rollback

Revert the OVE-341 repository commit. For each changed Linear issue, restore the
immediately preceding description revision from Linear history and verify its
SHA-256 against the `Before SHA-256` column before saving the next issue. Stop on
any mismatch. Do not alter a status, relation, project, milestone, label,
priority, estimate, or assignee as part of rollback.
