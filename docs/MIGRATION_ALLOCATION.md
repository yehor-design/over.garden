# SQL Migration Allocation

Status: binding reservation ledger
Owner: repository canon; introduced by OVE-318
Current Stable Registry authority: ADR-0016 and `docs/STABLE_REGISTRY.md`
Current highest landed migration at creation: `0022`

This file is the single reservation authority for concurrent future programs.
A reservation prevents two tasks from choosing the same number. It does not
create a migration, authorize a schema change, or allow one issue to use
another issue's number.

| Number | Owning issue | Program                | Intended boundary                                                 |
| ------ | ------------ | ---------------------- | ----------------------------------------------------------------- |
| `0023` | OVE-254      | Stable Registry        | immutable observed capture/source snapshot                        |
| `0024` | OVE-255      | Stable Registry        | Foundation release construction and activation                    |
| `0025` | OVE-256      | Stable Registry        | public source-archive versus approved-release read model          |
| `0026` | OVE-257      | Stable Registry        | active-release product selection/readback                         |
| `0027` | OVE-258      | Stable Registry        | editions, corrections, supersession, rollback                     |
| `0028` | OVE-259      | Stable Registry        | production landing/parity support when a schema delta is required |
| `0029` | OVE-321      | Online-only retirement | server-authoritative draft protocol                               |
| `0030` | OVE-322      | Online-only retirement | returning-device retirement bridge and cleanup state              |
| `0031` | OVE-331      | MVP posture            | public-projection quality/admission state when required           |
| `0032` | OVE-332      | MVP posture            | authorization/session posture state when required                 |
| `0033` | OVE-333      | MVP posture            | simplified media-ingest state when required                       |
| `0034` | OVE-334      | MVP posture            | quarantine-retirement state when required                         |
| `0035` | OVE-326      | Online-only retirement | final analytics-event constraint closure                          |

Compact range receipt:

- `0023-0028: Stable Registry children`
- `0029-0030: online-only retirement children`
- `0031-0034: MVP posture children`
- `0035: online-only steady-state enforcement`

The unused OVE-322 reservation at `0030` remains historical and
non-transferable. OVE-326 uses the next free number, `0035`; it does not inherit
or repurpose `0030`.

## Rules

1. The owning issue must re-read this file and the actual `apps/web/sql`
   inventory before creating its migration.
2. A number may be used only by its owner and only when that issue's validated
   vertical/bounded contract actually requires SQL.
3. An owner that needs no SQL leaves the reservation unused; it does not hand
   the number to another task implicitly.
4. Any landed migration that conflicts with this ledger stops implementation.
   Reconcile the ledger in a dedicated canon change before renumbering a child.
5. Existing migration files and historical receipts are never renamed to make
   the reservation appear consistent.
6. The Stable Registry and online-only canon checkers both read this ledger;
   the MVP-posture checker does the same after OVE-329.

OVE-318 creates only these reservations. It creates no SQL migration and makes
no database or production change.
