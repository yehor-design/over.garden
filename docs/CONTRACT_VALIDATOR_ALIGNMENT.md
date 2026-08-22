# Contract Validator Alignment

Status: checked evidence record for OVE-343

Schema: `contract-validator-alignment.v2`

Evidence date: `2026-08-22`

Repository baseline: `290e06aed951b3d7e9ef89aa1ccb0477763b9e5b`

## Boundary

This record covers exactly OVE-186, OVE-333, OVE-335, OVE-338, OVE-339,
OVE-342, OVE-343, and OVE-344. It does not assert that any other Linear issue
is valid, current, executable, or complete. A final task-validator pass proves
shape and vocabulary only; the separate classification records whether the
saved contract still agrees with current authority and ownership.

OVE-343 owns this evidence record and its test. It changes no product runtime,
provider state, relation graph, or other issue body. A
`material_rewrite_required` row is a stop receipt for that row's named owner,
not permission for OVE-343 to repair or start it.

## Export and validation contract

The authenticated Linear connector supplied each complete saved description,
status, and relation read-back. Each description was materialized as UTF-8
Markdown with exactly one terminal line feed. The `linkified` export preserves
Linear's `<issue ...>OVE-N</issue>` elements. The `raw` export replaces only
those elements with their visible `OVE-N` identifier and preserves every other
byte. Both exports were checked independently with:

```bash
cd apps/web
pnpm exec tsx scripts/check-linear-agent-task.ts --file <export-path> --phase final --json
```

The hashes below are the validator-reported SHA-256 values for those normalized
export artifacts. `findings` records the emitted code vector; repeated codes are
retained when the validator emitted more than one failed clause with the same
code.

## Machine-readable record

<!-- contract-validator-alignment.v2:start -->

```json
{
  "schema": "contract-validator-alignment.v2",
  "evidence_date": "2026-08-22",
  "export_contract": "Authenticated saved descriptions exported as UTF-8 Markdown with exactly one terminal LF; raw replaces only Linear issue elements with visible identifiers, while linkified preserves them.",
  "entries": [
    {
      "issue": "OVE-186",
      "raw_sha256": "15bee3bb939d3d76247d1696cb78d169b525e96fb4632127c26584cb03f268c2",
      "linkified_sha256": "2a4a46162eaecbf3ac0b1230782aedd968273acf1738997419fbf33dc5070d40",
      "raw_validator": {
        "valid": true,
        "findings": []
      },
      "linkified_validator": {
        "valid": true,
        "findings": []
      },
      "classification": "validated_current",
      "classification_reason": "The current external-state-only release contract passes both forms and remains correctly blocked by OVE-250 and OVE-339.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-186"
    },
    {
      "issue": "OVE-333",
      "raw_sha256": "0ec8d672a20033e0d14eede7f14b8ae0559e06c65f1f68bf6acc21189ba6503f",
      "linkified_sha256": "27fd6b38352f3771b252b70b6174a9c836fc3c7045b433732ac44967cae86b65",
      "raw_validator": {
        "valid": true,
        "findings": []
      },
      "linkified_validator": {
        "valid": true,
        "findings": []
      },
      "classification": "validated_current",
      "classification_reason": "The saved card is now a validator-passing non-executable coordination container for the OVE-345 through OVE-350 child DAG.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-333"
    },
    {
      "issue": "OVE-335",
      "raw_sha256": "625bb5fa67b1155285b6af240a289b790c8e39eed56f79eeff5d57b49f2b8a4a",
      "linkified_sha256": "ddf88a6e6abc8577c1cbcce64ac9f3ca8951c9f62ab9aab1f52bb8b19c811c63",
      "raw_validator": {
        "valid": true,
        "findings": []
      },
      "linkified_validator": {
        "valid": true,
        "findings": []
      },
      "classification": "validated_current",
      "classification_reason": "The corrected contract passes both forms and now inventories direct public-surface callers plus safe measured and locale inputs.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-335"
    },
    {
      "issue": "OVE-338",
      "raw_sha256": "c50bb5b45fcb61232fd7f85b6d7b8686aa913d8c79722a27b2c00435f0f7fec7",
      "linkified_sha256": "2f36f783bf61772e760f90a2d0e0fde16ace496c97d4afe634772f8b7ad0a29c",
      "raw_validator": {
        "valid": false,
        "findings": [
          "unresolved_placeholder",
          "core_context",
          "mvp_posture_context",
          "mvp_posture_serve_contract",
          "mvp_posture_serve_contract",
          "mvp_posture_admin_contract",
          "mvp_posture_admin_contract"
        ]
      },
      "linkified_validator": {
        "valid": false,
        "findings": [
          "unresolved_placeholder",
          "core_context",
          "mvp_posture_context",
          "mvp_posture_serve_contract",
          "mvp_posture_serve_contract",
          "mvp_posture_admin_contract",
          "mvp_posture_admin_contract"
        ]
      },
      "classification": "material_rewrite_required",
      "classification_reason": "Both forms fail for a placeholder and missing ADR-0018 serve, exposure, in-product-admin, and AdminUserRole clauses.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-338"
    },
    {
      "issue": "OVE-339",
      "raw_sha256": "590f3285cf354bf958e1c9f04e9af5e68db3c95de5ef2b399c69505028a32c75",
      "linkified_sha256": "b393c37e810416a307772a66a5c4a4d9cfaa4ec79dcd7df7cec86891a6176759",
      "raw_validator": {
        "valid": false,
        "findings": ["core_context", "mvp_posture_context"]
      },
      "linkified_validator": {
        "valid": false,
        "findings": ["core_context", "mvp_posture_context"]
      },
      "classification": "material_rewrite_required",
      "classification_reason": "Both forms fail because Required context omits the binding ADR-0018 posture authority.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-339"
    },
    {
      "issue": "OVE-342",
      "raw_sha256": "2eae607681911f2374066f617087cd18c1ab93faf1eb22863c003f2d05b8c925",
      "linkified_sha256": "02a1bb1605dc330b3f5718655b4e73098ce2a33e4c373ce9533c01c8887e4a1c",
      "raw_validator": {
        "valid": true,
        "findings": []
      },
      "linkified_validator": {
        "valid": true,
        "findings": []
      },
      "classification": "material_rewrite_required",
      "classification_reason": "Semantic read-back is stale: the body still treats OVE-333 as the retired executable media-simplification owner instead of the current child-owned container.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-342"
    },
    {
      "issue": "OVE-343",
      "raw_sha256": "a4c17e620009b56cb1969ef16858e35b3fac4992296ea71a38d359378a6aec7f",
      "linkified_sha256": "895a26f1ab8ebd9e44d9f87b66bedcef0a12bd35ab0b301768984f3f1d55db2e",
      "raw_validator": {
        "valid": true,
        "findings": []
      },
      "linkified_validator": {
        "valid": true,
        "findings": []
      },
      "classification": "validated_current",
      "classification_reason": "The corrected task-local body passes both forms and records the current OVE-333, OVE-335, and bounded cohort evidence without cross-card writes.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-343"
    },
    {
      "issue": "OVE-344",
      "raw_sha256": "cdd2f31a7606694668dee4087d7ad5188b429c5e2851e5250493a2cb78fd5fae",
      "linkified_sha256": "36e372eb868b93d731d764a2258723fb96dc6db0e811526853c11d6348aae5dc",
      "raw_validator": {
        "valid": true,
        "findings": []
      },
      "linkified_validator": {
        "valid": true,
        "findings": []
      },
      "classification": "material_rewrite_required",
      "classification_reason": "Semantic read-back is stale: the body says OVE-343 makes every open contract clean although OVE-343 is explicitly classification-only.",
      "evidence_date": "2026-08-22",
      "owner_or_reopen_target": "OVE-344"
    }
  ]
}
```

<!-- contract-validator-alignment.v2:end -->

## Classification receipt

| Classification              | Count | Issues                             |
| --------------------------- | ----: | ---------------------------------- |
| `validated_current`         |     4 | OVE-186, OVE-333, OVE-335, OVE-343 |
| `material_rewrite_required` |     4 | OVE-338, OVE-339, OVE-342, OVE-344 |
| `tooling_correction`        |     0 | none                               |
| `historical`                |     0 | none                               |

OVE-338 and OVE-339 are validator-visible failures. OVE-342 and OVE-344 are
validator-shape passes with evidenced semantic drift, which is why the
classification is intentionally independent from the validator receipt.

## Refresh and concurrency protocol

1. Fetch current `origin/main`, require a clean tree, and obtain a complete
   authenticated body, status, and relation read-back for all eight identifiers.
2. Materialize both export forms, compute both hashes, run the final validator,
   and classify against current authority before proposing a record change.
3. Re-read all eight bodies. A changed digest returns `stale_readback` and writes
   neither the record nor a Linear body. An already pending record change returns
   `sweep_already_running` and writes nothing.
4. Identical evidence produces byte-identical JSON. A delayed read is bounded by
   60 seconds; timeout or cancellation admits no late result and changes no
   tracked file or Linear body.
5. A later digest or semantic change reopens the named owner. It does not make
   this dated evidence silently current and does not authorize an OVE-343 edit
   to another issue.

The record contains only issue identifiers, non-secret hashes, finding classes,
dates, and classification reasons. It contains no credentials, raw descriptions,
user content, identity, precise location, media capability, provider secret, or
other sensitive read-back.
