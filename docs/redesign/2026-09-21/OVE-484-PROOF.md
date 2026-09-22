# Progressive space setup — OVE-484

Exact tested/merged identities, CI and production verification belong to the
authenticated Linear receipt.

## What changed

- `components/garden/space-setup-flow.tsx` — one flow, three questions in the
  Airbnb Where/When/Who shape: **Name** (required), **Region** (optional,
  "Skip" keeps it hidden), **Review**. One section is open; answered ones fold
  into a line with a named "Change: …" button; Back keeps every value; focus
  moves to the open question and to the first invalid field. Only real
  `spaces` columns are asked (`display_name`, `location_visibility`,
  `coarse_region_code`); no type field exists, so none is invented. Review says
  what will be created and that the space has no public page but its name can
  appear beside entries published in it — true of the public profile query.
  Actions stick to the bottom on a phone. Thiings `space-setup` art is card
  size and hidden below `sm`; no splash step.
- Modes: `create` (standalone, writes) and `propose` (inside the composer,
  writes nothing — the answers return to the editor and the existing atomic
  first-entry Publish creates space and entry together, as
  INFORMATION_ARCHITECTURE.md's transaction table decides).
- `POST /api/garden/spaces` + `server/space-repository.ts`: session authorized
  at the write; the client request id **is** the space id, so a double press,
  concurrent presses or a retry after a lost response read back one space
  (`replayed: true`, 200). An id owned by someone else is `conflict` and reveals
  nothing. A same-name space (case-insensitive) returns `duplicate_name` with
  the existing one; "Create another" sends `allowDuplicateName`. The check and
  insert share a per-owner advisory lock; 1.5 s statement timeout; the route
  settles within 4.5 s and answers 503 with a digest — the client then says the
  outcome is **uncertain** and that retrying the same request cannot duplicate.
- Entry points: My garden's Spaces section ("New space"), the composer's
  destination area ("Create a new space" opens the flow in a sheet), and
  `/garden/spaces/new?returnTo=/garden/...` for object setup, which receives
  `?space=<id>` (workspace paths only).
- Copy UK/BG/RU in `lib/space-setup-copy.ts`.

## Proof

`tests/space-setup.spec.ts` (registered in the gate), each outcome read back
from the database:

1. 320 px, keyboard: empty Next → field error with focus; Back keeps the name;
   region required once "show" is chosen; Change reopens a folded answer; axe
   WCAG 2.2 AA clean on review; Created is focused and the one row matches
   id/name/visibility/region exactly; no horizontal overflow.
2. Endpoint: 201 then 200 replay for one id; three concurrent replays → one
   row; duplicate name 409 → explicit second space 201; 422 for empty name and
   invalid region; 400 for a malformed id; a second gardener claiming the id →
   409 `conflict` with no row; guest → 401.
3. Lost response (request committed, answer aborted): "uncertain" message,
   retry → "already created by this request", one row.
4. Composer (BG): typed plant name survives; the proposed name lands in the
   editor; zero rows written.
5. Guest sees the sign-in prompt under the page heading; My garden links to the
   flow.

Adjacent specs rerun green: garden-workspace, owned-destinations,
journal-notion-composer, redesign-baselines. `pnpm test` and lint clean.

## Not claimed

No real screen-reader session (OVE-478 owns it). Object setup's consumption of
`?space=` lands with OVE-485.
