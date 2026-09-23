/**
 * The browser gate's one list (`OVE-462`).
 *
 * CI's proof step and `pnpm gates:browser` used to carry a list each, written
 * out by hand in a YAML string and a `package.json` string. They drifted the
 * way two lists do: seven specs were in neither, and the local gate ran its
 * specs against `next dev` while their own headers said "against a production
 * build". Now both call `scripts/run-browser-gate.ts`, which runs *this* list
 * against `next start`, and `scripts/check-browser-specs.ts` fails on a spec
 * in `tests/` that is neither here nor in `DEDICATED_BROWSER_SPECS`.
 *
 * Order is the order Playwright is handed the files in; it does not matter to
 * the result, and is kept by family so a reader can find a spec.
 */
export const BROWSER_GATE_SPECS = [
  // The document and what holds it (ADR-0032).
  "static-documents.spec.ts",
  "analytics-consent.spec.ts",
  "public-hydration.spec.ts",
  // Addresses, asked over HTTP without following a redirect.
  "catalog-addresses.spec.ts",
  "entry-addresses.spec.ts",
  "latin-names.spec.ts",
  // The catalogue and its owner surfaces.
  "catalog-picker.spec.ts",
  "owner-catalog-curation.spec.ts",
  "catalog-full-catalogue.spec.ts",
  // DESIGN.md §10, gates 7 and 8.
  "accessibility.spec.ts",
  "screen-states.spec.ts",
  "illustrations.spec.ts",
  "keyboard-sign-in.spec.ts",
  // The shell.
  "site-shell.spec.ts",
  "mobile-shell.spec.ts",
  "command-palette.spec.ts",
  "interface-locale.spec.ts",
  "auth-screen.spec.ts",
  "auth-intent.spec.ts",
  "auth-provider-retirement.spec.ts",
  // The page families.
  "journals-directory.spec.ts",
  "journal-entry.spec.ts",
  "journal-notion-composer.spec.ts",
  "publication-notice.spec.ts",
  "component-specimens.spec.ts",
  "redesign-fixtures.spec.ts",
  "owned-destinations.spec.ts",
  "space-setup.spec.ts",
  "object-setup.spec.ts",
  "entry-composer.spec.ts",
  "composer-media.spec.ts",
  "entry-editing.spec.ts",
  "redesign-baselines.spec.ts",
  "journal-deletion-retention.spec.ts",
  "public-profile.spec.ts",
  "public-profile-pages.spec.ts",
  "account-settings.spec.ts",
  "personal-surfaces.spec.ts",
  "notification-activity.spec.ts",
  "garden-workspace.spec.ts",
  "garden-collection.spec.ts",
  "space-page.spec.ts",
  "object-pages.spec.ts",
  "lineage-handoffs.spec.ts",
  "consent-and-erasure.spec.ts",
  "public-feed-cards.spec.ts",
  "entry-reading.spec.ts",
  "catalog.spec.ts",
  "catalog-door.spec.ts",
  "organism-card.spec.ts",
  "organism-pages.spec.ts",
  "knowledge-pages.spec.ts",
  "reading-pages.spec.ts",
  "editorial-surfaces.spec.ts",
  "communities.spec.ts",
  "community-contribution.spec.ts",
  "community-moderation.spec.ts",
] as const;

/**
 * Specs that cannot share the gate's server, the `package.json` script that
 * runs each one instead, and why. Checked both ways: the script must exist and
 * name the spec, and an entry for a spec that has joined the gate is stale.
 */
export const DEDICATED_BROWSER_SPECS: Readonly<
  Record<string, { script: string; reason: string }>
> = {
  "google-account-linking.spec.ts": {
    script: "test:google-account-linking",
    reason:
      "needs a server started with GOOGLE_ACCOUNT_LINKING_ENABLED=true, which changes what the sign-in and profile screens offer to every other spec",
  },
};
