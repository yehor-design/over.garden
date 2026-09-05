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

| Task | Consumes | Leaves behind for the next tasks |
| --- | --- | --- |
| `OVE-386` foundation | the flat catalog and the source layer | `0054` everywhere; node columns, six graph tables, queue and action tables, slug history, search misses; `catalog_normalize_name` in SQL, TS and Python with one fixture; the fingerprint script and its query list; generated types |
| `OVE-387` picker and labels | `0054` | `0055` everywhere; `/api/public/catalog/typeahead`; labels instead of provisional cards; weight function and cron; misses filling; Playwright spec; latency script |
| `OVE-388` addresses | slug history, identifiers | hierarchical routes, five resolvers, `src/lib/catalog/slugs.ts`, `Taxon` JSON-LD builder, one path builder, canonical sitemap URLs |
| `OVE-389` card | routes | cached card read with tags, sections, shared attribution, `organism_without_first_hand_content`, card revalidate cron |
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
