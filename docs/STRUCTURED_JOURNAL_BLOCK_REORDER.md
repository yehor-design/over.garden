# OVE-206 Accessible Journal Block Reorder

Status: done on main (Vercel READY); founder iPhone Safari checklist required before Linear Done
Issue: OVE-206

## Contract

- Canonical commit primitive: Editor.js `blocks.move(toIndex, fromIndex)` only.
- Application-owned drag handle starts pointer/touch gestures; text selection, editing, links, image controls, and ordinary scrolling stay available outside the handle.
- Localized Move up / Move down controls are keyboard/AT reachable on every block; first/last boundary actions disable truthfully.
- Built-in Editor.js `moveUp` / `moveDown` / `delete` tunes are localized through composer i18n.
- Source and destination resolve by stable block ID. Same-position drop and cancel paths create no mutation.
- One committed move is one serialization generation and one live-region announcement with focus restoration.
- Active gesture registers `owner-composer-reorder-gesture` as an OVE-205 `in-flight` participant so Bulgaria locale control stays visible and disabled; Ukraine remains zero-control.
- After commit, OVE-202 `owner-composer-drafts` flush/seal owns locale transition persistence. Do not fork the coordinator.
- Image moves preserve the same `mediaAssetId`, block ID, and offline intent mapping. Reorder never re-uploads or cross-claims media.
- Public `JournalDocumentRenderer` loads no Editor.js and no reorder chrome.
- OVE-207 cover UI is not owned here; automatic-cover fallback remains derived from canonical `JournalDocumentV1` order.

## Surfaces

- Pure contract: `apps/web/src/components/garden/journal-block-reorder.ts`
- DOM controller: `apps/web/src/components/garden/journal-block-reorder-controller.ts`
- Owner composer wiring: `StructuredJournalComposer`
- Copy: `getStructuredJournalComposerLabels(locale).reorder` (`uk` / `bg` / `ru`)
- Downstream ledger: OVE-206 `browser-backed` with scenario `pointer-commit-immediate-transition`

## Verification

```bash
cd apps/web
pnpm test src/components/garden/journal-block-reorder.test.tsx \
  src/lib/garden/journal-document.test.ts \
  src/lib/offline/drafts.test.ts \
  src/lib/offline/journal-entry-sync.test.ts
pnpm smoke:journal-block-reorder
pnpm localization:coverage:check
pnpm lint && pnpm typecheck && pnpm test
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build
git diff --check
```

Closeout pattern matches OVE-202/OVE-208: local suite + Vercel `READY` for exact SHA. GitHub Actions may remain `workflow_dispatch` under budget freeze.

## Physical iPhone checklist (founder)

Required before Linear Done:

1. Open first-entry composer on current-support iPhone Safari
2. Drag from the handle only; confirm normal page scroll and text selection still work outside the handle
3. Move paragraph, heading, list, quote, delimiter, and photo with Move up / Move down
4. Confirm live-region / focus after move at first, middle, and last positions
5. Cancel an in-progress drag with Escape or lifting outside a valid target; order unchanged
6. During an active drag on `/bg`, language control stays visible and disabled; no locale navigation
7. Commit a move, then switch `bg` ↔ `ru`; exact order and photo identities survive
8. Offline / reload resume keeps the reordered block-ID sequence
9. 10 inline photos still reorder without duplication or loss

Do not record private journal text, media URLs, block IDs, or identities in evidence.
