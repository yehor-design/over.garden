# Organism graph execution runbook (SDD Slice 24)

Status: living document for the duration of SDD Slice 24 (`OVE-386` through
`OVE-399`). Read it with `AGENTS.md`, `docs/PROJECT_STATE.md`,
`docs/adr/ADR-0026-organism-knowledge-graph.md` and the Linear issue you are
executing. If a step here is wrong, fix this page in the same PR as the work.

## 1. Authority: the owner's standing authorization

On 2026-09-05, late in the evening, after the fourteen tasks were created, the
owner wrote, verbatim:

> даю повне схвалення на автоматичне виконання без мого втручання і підпису,
> вкажи це в задачах.

In English: full approval for automatic execution without the owner's
intervention or signature, to be recorded in the tasks.

**Scope.** Every production step that SDD Slice 24 requires, for the issues
`OVE-386` through `OVE-399` only:

- applying each of the slice's migrations (`0054` through `0061`) to the
  production database, including the destructive closeout migration `0061`;
- installing and deploying each sealed matching worker release on the droplet;
- running the second EPPO observed capture with the stored key;
- running the slice's data jobs in production: source ingests, reconciliation,
  the transfer of the completed EPPO captures, importer re-runs, weight and card
  recomputes;
- the Vercel production deploys that follow each merge to `main`.

This is the "one explicit approval each" that `AGENTS.md` requires for changes
to production data, schema or provider state, given in advance for this slice,
and the "owner's explicit sign-off" that hard rule 10 requires for the one
destructive schema change the slice contains. `docs/adr/ADR-0026-organism-knowledge-graph.md`
carries the same text as a dated amendment.

**What stays gated, technically, not by approval.** Green CI on the PR;
executed proofs on a fresh bootstrap for every migration (forward, back,
forward); a read-only inventory before every production migration; zero rows
in every table `0061` drops and no `user_added` object before it runs; a
rollback file beside every migration; the capacity gate of the worker
installer; the capture tool's loopback-only rule. If a gate fails, stop and fix
the cause; do not ask the owner to waive it.

**What the authorization does not cover.** Anything outside the fourteen
issues; deleting or rewriting gardener data that is not the executor's own
test data; typing or printing a credential; Vercel environment writes (they are
classifier-gated and the owner has to grant a rule for each shape); history
rewrites and force-pushes. For those, ask.

## 2. Starting a task

1. `git fetch origin && git checkout -B main origin/main` on a clean tree.
2. Read, in this order: `AGENTS.md`, `docs/PROJECT_STATE.md`, the vocabulary
   section of ADR-0026, the Linear issue, this page.
3. Branch `codex/ove-<number>-<slug>`; move the issue to In Progress.
4. Implement end to end: SQL, repository, route or action, UI, tests, docs.
5. One PR per issue. Conventional Commits. Never name a Done Linear issue in
   the PR title or body: the GitHub integration reopens it. Describe the work
   instead, and name only the issue the PR delivers.
6. Merge on green CI with a merge commit (`gh pr merge <n> --merge --delete-branch`),
   sync `main`, do the production step the issue names, write the receipts as
   a comment on the issue, move it to Done.

## 3. Environment and toolchain quirks

- **Node.** The agent's `PATH` may carry Node 20 first. `pnpm exec …` resolves
  the right Node by itself; for `pnpm <script>` gates such as `pnpm test`, run
  `cd apps/web` as its own call and then the plain `pnpm …` command. Never
  prefix a production command with `PATH=…`: a prefix or a pipe turns the
  command into a compound one, which the auto-mode classifier judges
  non-deterministically. Plain `pnpm …` commands with absolute paths are
  allowed deterministically.
- **Dependencies.** After pulling work that added packages:
  `cd apps/web && pnpm install --frozen-lockfile`. A wave of `TS2307` across
  untouched files is stale `node_modules`, not a regression.
- **Stale `.next`.** `rm -rf apps/web/.next` when typecheck imports pages
  that were deleted. CI never sees this because it builds fresh.
- **Local Postgres.** `infra/container-up` starts it (Apple Container first,
  Docker as fallback). The loopback database `overgarden` is a scratch volume
  that holds the completed EPPO capture `df3852ea-3233-4883-8886-92d9e68f5193`
  (1.5 GB, irreplaceable without another day of provider requests). Never drop
  or recreate it. `pnpm local:bootstrap` fails on it by design; bring it
  forward one migration at a time with
  `pnpm exec tsx scripts/apply-reviewed-migration.ts --mode apply --migration NNNN --allow-host-class loopback --env-file .env.local`
  from `apps/web`. If the volume is ever lost, restore the capture from the
  `pg_dump` at `~/Desktop/Startups/OverGarden-data/eppo/` with the command in
  its README, into a database that already has migrations `0023`, `0042`,
  `0048` and the `0025` archive tables.
- **Generated types.** `pnpm db:types:check` fails on the scratch volume and
  always will, because its introspection carries retired objects. Generate
  and check types against a fresh, disposable bootstrap; CI is the truth.
- **Python worker.** `cd services/matching && uv sync --frozen`;
  `uv run --frozen pytest -q` with `OVERGARDEN_TEST_DATABASE_URL` pointing at a
  disposable Postgres for the executed tests in `tests/test_runtime_database.py`.
  `services/matching/README.md` has the local run commands.
- **Job queue contract.** `apps/web/src/server/job-queue-manifest.ts` is the
  only place that declares a kind. `pnpm queue:contract:build` regenerates the
  JSON contract and the Python module; `queue:contract:check` fails on drift;
  `queue:contract:prove-database` executes the database half. Never hand-edit
  the generated files.
- **Browser proofs.** `tests/public-hydration.spec.ts` and
  `pnpm test:public-hydration` are the model for a Playwright spec against a
  production build. Signed-in flows are verified in a real browser; the
  preview browser's network panel has reported false 5xx before, so confirm a
  5xx against Vercel runtime logs before chasing it.
- **Index builds and the planner.** On PostgreSQL 18 a `create index …
  using gin (… gin_trgm_ops)` left `pg_class.reltuples` of the name table at
  1.8e35 and every picker query planned as a parallel nested loop (430 ms
  instead of 5 ms) until `analyze`. A migration that builds an index ends with
  `analyze` of the tables it touches, and a query is measured only after it.
  A CTE that calls `catalog_normalize_name` over a whole table must be
  `materialized`, or the planner re-evaluates it per outer row of an update.
- **Browser specs against the composer.** The picker sits under the closed
  "Більше деталей" `<details>`; native `<select>`s also carry
  `role="combobox"`, so scope to `[data-catalog-picker="true"]`; a new gardener
  must fill the required `spaceName`; `page.addScriptTag` is blocked by the CSP
  and hangs, so inject axe with `page.evaluate`; sign-up answers 500 on the
  missing mail provider after the rows exist; a run killed at the test timeout
  skips `finally`, so `tests/catalog-picker.spec.ts` cleans stale runs first.
- **Organism addresses (24.03).** The HTTP status of `/species/…`,
  `/variety/…` and `/breed/…` is decided in `src/proxy.ts` with one bounded
  lookup: under Cache Components a page-level `notFound()` or
  `permanentRedirect()` answers 200 on a hard load (ADR-0026, consequences).
  The canonical and every redirect target follow the route family
  (unprefixed, `/bg`, `/ru`), never the cookie locale, so a unit test that
  sets the interface locale to `bg` on the unprefixed page still expects an
  unprefixed canonical. `readPublicCatalogAddress` and
  `readPublicVarietyPageByCatalogItemId` are `use cache` for hours: a slug
  assignment or a merge must revalidate `organismAddressChangeTags(id)`
  (`src/lib/public-cache-tags.ts`), because a form's cached page carries its
  species' slug. `toMatchObject` on a JSON-LD `@graph` array needs every node
  listed. `tests/catalog-addresses.spec.ts` is request-only (no browser) and
  seeds a species, a form, an orphan form, an EPPO identifier and one public
  entry per organism so the sitemap rows and the engagement panel exist; it
  cleans stale `ove388-` runs first. A variety without public entries is not
  a public engagement target: the page asks for the panel only when it has
  entries and degrades to no panel on failure, or every zero-entry register
  cultivar answers a digest error behind a streamed 200 (the server log
  shows it, the status does not).
- **Vercel crons run at most daily on this plan.** A `vercel.json` schedule
  that fires more often (`*/10 * * * *`) makes the deployment fail before it
  builds, with a status link to the cron pricing page and nothing in CI; the
  previous production build stays live. Schedule daily and let the cache
  profile bound staleness, or ask the owner about the Pro plan.
- **plpgsql function bodies are validated at CREATE time.** A migration that
  creates a function declaring `table%rowtype` fails on a database that holds
  only the tables the proof under way cares about; the job-queue contract
  proof therefore runs `set check_function_bodies = off` before applying, and
  the functions are proven against a full schema by
  `services/matching/tests/test_catalog_reconcile_database.py`.
- **`apply-reviewed-migration` counts semicolons.** A migration with plpgsql
  bodies reports far more statements than it runs (0056: 150 counted, about
  twenty real). The count is a receipt field, not the execution unit; the
  whole file is sent as one statement.
- **A migration that changes the queue contract must be applied with the
  worker deploy, not before the merge.** Section 4.1 applies a web migration
  from the PR branch; the worker's runtime requires every payload CHECK the
  contract it was built from declares (`_REQUIRED_QUEUE_CONSTRAINTS`), so
  dropping a retired kind's check puts the *incumbent* worker into
  `schema_mismatch` and its container reports unhealthy until the new image is
  deployed. It keeps claiming and draining (the loop never reads the
  constraint set) and does not restart, but the health signal is wrong for the
  whole window. For such a migration, follow 4.2's order instead: seal,
  install, migrate, deploy. Seen on 2026-09-06 with `0056`.
- **New table, generated types.** A migration that adds a table needs its
  interface hand-written into `apps/web/src/db/generated.ts` (and its entry in
  `DB`); `pnpm db:types:check` runs against a fresh CI bootstrap and is the
  only honest check, because the scratch volume's introspection carries drift.
- **gnparser.** The scientific-name parser is a pinned GitHub release
  installed by `services/matching/scripts/install-gnparser.sh` (version and
  both checksums live there) into the image, the CI job and the release job.
  A developer runs the same script; without it the ladder's second rung is
  skipped with a reason and its tests skip, never guessing.
- **One romanization, two implementations.** `app/romanize.py` mirrors
  `apps/web/src/lib/catalog/slugs.ts` and both are held to
  `contracts/catalog/form-slug.fixture.json`. The ladder matches a Latin
  spelling of a Cyrillic denomination by the same rule the form's address
  uses, so a link and an address can never disagree.
- **Owner curation (24.06).** The owner surfaces are gated on a user id the
  server reads at start (`OVERGARDEN_ADMIN_OWNER_USER_ID`), so a browser proof
  cannot create the account it needs: `pnpm owner:seed-browser-fixture` writes
  the sealed owner with a fixed id before the server starts, and CI passes the
  same id to `next start`. Three things only executing the page could find:
  1. **`OwnerScopedActionForm` needs hydration.** It wrapped the action in a
     client closure for `useActionState`, and React answered with
     `action="javascript:throw new Error('React form unexpectedly
     submitted.')"`. `OwnerScopedProgressiveForm` passes the reference through
     and takes an action shaped `(previousState, formData)`; the queue, the
     sources page and the card controls use it, and
     `src/components/auth/owner-scope.progressive.test.ts` reads the source to
     keep it that way. The other nineteen call sites of the old form still
     need hydration.
  2. **A statement cannot read the rows a function it calls has just
     inserted.** `applyCatalogQueueItem` and `revertCatalogAction` joined
     `catalog_curation_actions` in the same statement as
     `catalog_apply_queue_item(...)`: the query's snapshot predates the insert,
     so every decision applied and then threw "returned no action" with a 500.
     Two statements now; the mocked test pins the shape, and only the browser
     run against Postgres could see the original.
  3. **Playwright's `request.post` is not a browser's form post.** The same
     multipart body sent through `context.request.post` answered "Failed to
     find Server Action" while `fetch` and `curl` with the identical fields
     succeeded. Prove a no-JavaScript control with plain `fetch` and the
     context's cookies.
  A decided queue row and the node under it cannot be deleted afterwards:
  `catalog_curation_actions.queue_item_id` is `on delete set null` and the
  audit table refuses every update, so the cascade behind the delete is
  refused. Fixtures clean what is open and leave the decided rows.
- **Catalogue of Life (24.07).** The July 2026 release is 5,413,595 usages,
  a 1.0 GB ColDP archive, and 3.3 GB in Postgres with its indexes. Five things
  only the real archive and a real browser could show:
  1. **Python's csv module refuses a field over 128 KiB.** One free-text field
     in the release is larger; `csv.field_size_limit` is raised in
     `app/col_ingest.py`. A ten-thousand-row fixture never comes close.
  2. **Load without the search indexes.** Keeping the trigram and prefix
     indexes during the COPY turned the load into more than an hour and it
     never finished on the container; dropping them inside the ingest's
     transaction and recreating them after made it **115 seconds**. On failure
     the transaction rolls back and the indexes come back with it, so the
     rebuild runs only on success — rebuilding inside a failed transaction
     replaces the real error with `InFailedSqlTransaction`.
  3. **A statement still cannot read what its own function inserted.** The
     create-on-pick path joined `catalog_items` in the same statement that
     called `catalog_col_materialize`, so the node was created and the read
     came back empty; the picker silently kept the query. Two statements, as
     in 24.06.
  4. **A new node needs its address cache expired.** `readPublicCatalogAddress`
     is `use cache` for hours, so a node created by a gardener's pick answered
     404 on its own card until the action revalidated
     `organismAddressChangeTags(id)`.
  5. **Match on both spellings.** OverGarden names nodes with their authority
     ("Solanum lycopersicum L."); Catalogue of Life keeps the authorship in a
     column. Comparing against a computed expression made the scoped
     materialization take 176 s for 300 nodes; a stored generated column with
     an index made it **297 ms**.
  **The job outlives its lease.** A scan's visibility timeout is 300 s
  (`CATALOG_MATCH_WORKER_VT_SECONDS`) and a release takes longer than that
  against a managed database, so another worker could claim the same job.
  `pg_try_advisory_lock` in the ingest is what makes that safe: a second run
  answers `alreadyRunning` and writes nothing. Raise the lease on the droplet
  rather than removing the lock.

  **Production is scoped.** The managed database has 10 GiB of disk and held
  342 MB before this task, so the whole release does not fit beside the
  application's own data. `COL_INGEST_KINGDOMS=Plantae,Fungi,Chromista` keeps
  1,976,974 usages (about 1.2 GB), which is what the readiness manifest asked
  for in words: "importer must scope to plant catalog needs first". The scope
  is written into the snapshot's `source_version`, so a row always says what it
  holds. Animalia is one environment variable away once the plan is larger.
- **Research corpus.** `docs/product-research/` and
  `/Users/yehor/Desktop/Startups/OverGarden` must stay byte-identical except
  `README.md` and four desktop-only items. After editing a research file, copy
  it to the desktop tree and `diff -rq` the two. Three `.txt` files there are
  BOM plus CRLF; never rewrite them with a text-mode Python pass.

## 4. Production procedures

### 4.1 Applying a migration

1. Pull the production environment to an absolute path outside the repo:
   `vercel env pull /abs/path/prod.env --environment production` from
   `apps/web` (the pulled file lacks `CRON_SECRET`; that is expected and
   irrelevant here).
2. `cd /Users/yehor/frontend/over.garden/apps/web` as its own call.
3. Read-only inventory, plain command:
   `pnpm exec tsx scripts/apply-reviewed-migration.ts --mode inventory --env-file /abs/path/prod.env`.
   It prints the host class (DigitalOcean-managed, never a URL) and the state
   of every migration. Confirm the class is production before anything else.
4. Apply, plain command:
   `pnpm exec tsx scripts/apply-reviewed-migration.ts --mode apply --migration NNNN --env-file /abs/path/prod.env`.
5. Inventory again; record before and after in
   `docs/PRODUCTION_SCHEMA_STATE.md` in the same PR as the code, with the
   host class and the statement count the applier prints.
6. Never use `vercel env run -e production` as production evidence: a value in
   `apps/web/.env.local` shadows the pulled one and the command can silently
   read the laptop. If you must use it, move `.env.local` aside for the run and
   print the host class first.

### 4.2 Deploying a sealed worker release

1. Merge to `main`. `.github/workflows/matching-image.yml` seals a release for
   that exact commit and uploads an artifact `matching-release-<sha>-run-<run>-1`.
   Tags in the registry pushed before 2026-09-05 are unsealed; never install
   one of those.
2. `gh run download <run> -n matching-release-<sha>-run-<run>-1`, then
   `scp -r` the directory to `/opt/overgarden/incoming-<date>-<short sha>` on
   the droplet.
3. On the host, run each step detached so a dropped ssh session cannot kill it:
   `nohup setsid /opt/overgarden/matching-release install /opt/overgarden/incoming-… > /root/install.log 2>&1 < /dev/null &`,
   then `migrate <key>`, then `deploy <key>`, then `status`; `sleep` and `cat`
   the log after each.
4. Capacity gate: `install` needs 5 GiB plus the archive free on both
   `/opt/overgarden` and the Docker root; `deploy` needs 5 GiB again after the
   image is loaded. Safe to remove: `incoming-*`, `/tmp/ove*`, `apt-get clean`,
   `journalctl --rotate && journalctl --vacuum-size=200M`. Installed releases
   and the images of the current and previous pointer are not.
5. Verify from `apps/web`:
   `pnpm smoke:matching-queue-health -- --environment production --confirm-environment production`
   and `pnpm smoke:matching-runtime-capabilities`. The heartbeat row must show
   the handler set the manifest declares.
6. Record the release digest, the run id and the heartbeat handler set on the
   issue. `infra/production-worker/README.md` is the full runbook.

### 4.3 The second EPPO capture

1. Loopback database only; the tool refuses a remote host. Run from a
   dedicated git worktree pinned at the merged commit, never from the checkout
   that commits.
2. The key comes from the encrypted store as `docs/EPPO_CREDENTIAL_BOOTSTRAP.md`
   describes. It never appears in a shell argument, a file, a log, Linear or
   chat.
3. `pnpm eppo:observed-capture -- --mode plan …` first, then `--mode capture`
   with the new endpoint classes and `--base-capture df3852ea-3233-4883-8886-92d9e68f5193`,
   concurrency 1, request timeout 15000, two attempts. The first capture took
   eight and a half hours for 365,331 requests; plan for more than a day and
   use `--mode resume` after any pause. `--mode verify --status-only` is safe
   from a second terminal.
4. Transfer to production with the purpose-built script the EPPO task
   creates, never with a blind `pg_restore`: production already holds source
   snapshots whose unique keys would collide.

### 4.4 Data jobs in production

Source ingests, reconciliation and recomputes run through the deployed worker
against the production database. Enqueue them from the owner's sources page
or with a plain `pnpm exec tsx` script that inserts the `job_queue` row with an
idempotency key. Rehearse every job on the loopback database first and record
counts and duration on the issue for both runs.

## 5. Order, hand-offs, definition of done

All fourteen are sub-issues of the umbrella issue `OVE-400`, numbered `24.01`
to `24.14` in their titles; the umbrella closes only when every sub-issue is
Done.

| Task | Consumes | Leaves behind for the next tasks |
| --- | --- | --- |
| `OVE-386` foundation | the flat catalog and the source layer | `0054` everywhere; node columns, six graph tables, queue and action tables, slug history, search misses; `catalog_normalize_name` in SQL, TS and Python with one fixture; the fingerprint script and its query list; generated types |
| `OVE-387` picker and labels | `0054` | `0055` everywhere; `/api/public/catalog/typeahead`; labels instead of provisional cards; weight function and cron; misses filling; Playwright spec; latency script |
| `OVE-388` addresses | slug history, identifiers | hierarchical routes, five resolvers, `src/lib/catalog/slugs.ts`, `Taxon` JSON-LD builder, one path builder, canonical sitemap URLs |
| `OVE-389` card | routes | cached card read with tags, sections, shared attribution, `organism_without_first_hand_content`, card revalidate cron; `0062` (the outbox entity kind `catalog_item`, taken outside the reserved block because 0054 added the reason without the kind) |
| `OVE-390` reconciliation | queue tables, labels | `0056` everywhere; four job kinds in the contract; `catalog_reconcile.py`; apply and revert SQL functions; thresholds; deployed worker |
| `OVE-391` owner surfaces | apply and revert functions, job kinds | queue and sources pages, two menu links, inline edit, audit, digest cron |
| `OVE-392` Catalogue of Life | ladder, owner pages, typeahead route | `0057` everywhere; COL usages in production; nodes with parents, ranks, kingdoms, ancestors; secondary search path; refresh diff |
| `OVE-393` Wikidata | COL nodes | Wikidata and crosswalk identifiers, accepted vernaculars, Wikidata `sameAs` |
| `OVE-394` EPPO | COL nodes, crosswalk | `0058` everywhere; second capture closed; both captures in production; EPPO identifiers, names, `pest_of`, presence and categorization facts; presence badges; attribution line |
| `OVE-395` registers and breeds | COL nodes, slugs, ladder | cultivar and breed nodes with `form_of`, registration facts, market flags |
| `OVE-396` WFO and GBIF | Wikidata ids | `wfo` and `gbif` identifiers with snapshots |
| `OVE-397` pest mentions | pest nodes, card | pest chips in the mention typeahead; aggregation on cards; `0059` if a table |
| `OVE-398` metrics | misses, sources page | `0060` everywhere; pick events with purge; health tab |
| `OVE-399` closeout | everything | `0061` applied; legacy shape, Meilisearch catalog index and retired kinds gone; final worker; `pnpm prove:organism-graph` with receipt; reconciled docs; dated delivery log |

A task is done when: the PR is merged on green CI; every acceptance criterion
has its evidence in a comment on the issue (commands, outputs, hashes, counts,
URLs); the production step the issue names is done and recorded
(`docs/PRODUCTION_SCHEMA_STATE.md` for a migration, the release digest and
heartbeat for a deploy, the counts for a data job); the documents the issue
names are updated; the issue is Done; local `main` is synced.

## 6. Where to write what

- A behaviour change: its topic document plus `docs/PROJECT_STATE.md`.
- A decision: an amendment to ADR-0026 or a new ADR.
- A migration applied in production: `docs/PRODUCTION_SCHEMA_STATE.md`.
- The slice's narrative: a dated delivery log, written by the closeout task.
- Receipts for a single task: a comment on its Linear issue.
