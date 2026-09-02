# Accessible Journal Block Reorder

Status: current implementation contract
Owner: OVE-317, preserving the OVE-206 product outcome

## Contract

- `MOVE_JOURNAL_BLOCK_COMMAND` moves one top-level semantic Lexical node in the
  native editor tree. DOM order is presentation only and no observer is a state
  authority.
- Source and destination resolve by stable application block ID. Same-position,
  missing-source, and boundary moves are no-ops.
- One committed move is one history transaction, one semantic generation, and
  one localized live-region announcement. Undo and redo restore exact IDs and
  order.
- The application drag handle owns pointer/touch gestures. Text editing,
  selection, links, image controls, and ordinary scrolling remain available
  outside the handle.
- Localized Move up and Move down controls are keyboard and assistive-technology
  reachable. First/last actions disable truthfully, controls are at least
  44 by 44 CSS pixels, and focus is restored to the moved block control.
- Localized Delete removes a non-image semantic block in one undoable native
  transaction and announces the result. Deleting the final block creates one
  fresh canonical paragraph. Images remain on their media-aware remove control
  so object-URL and admission cleanup cannot be bypassed.
- Escape or an invalid drop cancels without a canonical mutation.
- Active gesture registers `owner-composer-reorder-gesture` as an in-flight
  locale participant. After commit, `owner-composer-drafts` owns the flush/seal
  transition; there is no second coordinator.
- Reorder preserves block ID, media asset ID, transient upload intent mapping, and image
  reservation. It never re-uploads or cross-claims media.
- Public and owner read rendering contains neither reorder chrome nor authoring
  runtime.

## Surfaces

- Native command and UI:
  `apps/web/src/components/garden/lexical-journal/journal-node-reorder-plugin.tsx`
- Focused history/identity tests:
  `apps/web/src/components/garden/lexical-journal/journal-node-reorder.test.tsx`
- Shared owner: `StructuredJournalComposer`
- Localized copy: `getStructuredJournalComposerLabels(locale).reorder`
- Downstream scenario: `pointer-commit-immediate-transition`

## Verification

```bash
cd apps/web
pnpm exec vitest run \
  src/components/garden/lexical-journal/journal-node-reorder.test.tsx \
  src/lib/garden/journal-document-lexical-adapter.test.ts \
  src/lib/garden/online-journal-draft.test.ts \
  src/lib/garden/online-journal-submit.test.ts
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Reorder behaviour is proven by the unit tests above. The former browser and
device matrices were retired by ADR-0022; there is no separate browser gate.
