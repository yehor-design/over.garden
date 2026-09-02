# Container Runtime Policy

Status: binding for runtime work started by OVE-71.

Apple Container is the preferred local container runtime for OverGarden on supported Apple Silicon/macOS 26 machines. Docker is retained only where Apple Container is unavailable, unsupported, or missing a specific feature required by the surface being proven. New runtime work must try to move local containerized development to Apple Container first, then document any Docker fallback with a concrete reason.

This policy does not delete every Docker reference immediately. It classifies the remaining references so agents can migrate them deliberately instead of treating Docker Desktop as the default local dependency.

## Fallback Matrix

| Surface                                                              | Apple Container target | Docker retained        | Reason Docker may remain                                                                                                                                                                                                                                                                                                                                                      | Owner                  |
| -------------------------------------------------------------------- | ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Supported local Mac development                                      | Yes                    | Fallback only          | OVE-72 provides the Apple Container service trio start/status/down path. OVE-73 proves the fresh-checkout web bootstrap and test path against those services with Docker Desktop stopped. OVE-77 closes the local cleanup proof, so Docker Desktop can be removed from supported Apple Silicon/macOS 26 local development machines.                                           | OVE-72, OVE-73, OVE-77 |
| Unsupported developer machines                                       | No                     | Yes                    | Apple Container is macOS/Apple Silicon scoped. Docker remains the practical fallback for unsupported hosts, older macOS versions, or a documented Apple Container feature gap.                                                                                                                                                                                                | OVE-77                 |
| Local Postgres                                                       | Yes                    | Fallback only          | `infra/container-up` starts Postgres 18 on `127.0.0.1:5432` with a version-specific named Apple Container volume. Docker Compose remains for unsupported hosts or verified feature gaps and uses the same Postgres major version.                                                                                                                                             | OVE-72, OVE-95         |
| Local Meilisearch                                                    | Yes                    | Fallback only          | `infra/container-up` starts Meilisearch on `127.0.0.1:7700` with a named Apple Container volume and `infra/container-status` checks `/health`.                                                                                                                                                                                                                                | OVE-72                 |
| Local MinIO/S3 emulator                                              | Yes                    | Fallback only          | `infra/container-up` starts MinIO on `127.0.0.1:9000` and console `127.0.0.1:9001` with an exact active named-volume contract. OVE-189 adds fail-fast corruption classification, read-only source recovery into an explicit new target, preserved-source protection, and actual media/restart proof.                                                                          | OVE-72, OVE-189        |
| Matching image build and local worker/search smoke                   | Yes                    | Fallback only          | OVE-74 proves `container build` for `services/matching/Dockerfile`, starts the FastAPI health process from the Apple Container-built image, and runs native worker/search proofs against Apple Container Postgres/Meilisearch. Dockerfile syntax remains a portable OCI recipe.                                                                                               | OVE-74                 |
| GitHub Actions Ubuntu CI                                             | No                     | Yes                    | Apple Container is not an Ubuntu CI service-container runtime. Docker is acceptable only for CI services the hosted Ubuntu runner requires. OVE-75 confirms this as a platform-bound CI exception, not a local Docker Desktop dependency.                                                                                                                                     | OVE-75                 |
| Production DigitalOcean Linux worker droplet                         | No                     | Yes                    | Apple Container runs local Linux containers on supported Apple Silicon Macs; it is not the DigitalOcean Linux droplet process manager. OVE-76 confirms Docker Compose remains the current production process manager because OVE-39 live-proved restart policy, health, and journal index/unindex recovery for `matching-worker`, `matching-api`, `meilisearch`, and `caddy`. | OVE-76                 |
| Historical ADRs, scaffold notes, copied research, and old proof logs | Not operational        | Yes, as history        | Historical files may describe the runtime that existed when the proof was captured. Current operational instructions must point back to this policy.                                                                                                                                                                                                                          | OVE-71                 |
| Mature Compose-only behavior                                         | Maybe                  | Yes, with explicit gap | If restart policy, health orchestration, networking, volume, or multi-service semantics cannot be reproduced safely with Apple Container, keep Docker for that exact surface and name the gap.                                                                                                                                                                                | Any runtime issue      |
| Composed self-hosted stack                                           | No                     | Yes                    | Apple Container is macOS/Apple Silicon scoped and is not a Linux host process manager. `infra/docker-compose.stack.yml` is a portable Compose recipe under `production-linux-required`; it is authored to run on any Linux host, on either architecture, and names no hosting provider. Owner: `docs/SELF_HOSTED_STACK.md`.                                              | OVE-358                |

## Reference Classification

Use these labels when touching docs or Linear issues that still mention Docker:

| Label                       | Meaning                                                                | Required action                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apple-container-target`    | Local containerized development should move to Apple Container.        | Implement or verify the Apple Container path before accepting Docker as fallback.                                                                         |
| `temporary-fallback`        | Docker remains only until a named migration issue lands.               | Link the owning issue and keep commands clearly marked as fallback.                                                                                       |
| `unsupported-host-fallback` | Apple Container cannot run on the developer host.                      | Keep Docker instructions, but do not make Docker Desktop the default for supported Macs.                                                                  |
| `ci-required`               | The surface runs on Ubuntu/GitHub Actions or another non-macOS runner. | Docker is allowed; document that Apple Container does not fit the runner and do not imply Docker Desktop is a local prerequisite.                         |
| `production-linux-required` | The surface is the current Linux production process manager.           | Docker Compose may remain until a new production ADR/process manager supersedes it with equivalent live restart, health, and journal index/unindex proof. |
| `historical-record`         | The file records what an older proof used.                             | Do not rewrite history as if it happened on Apple Container; add a current-policy pointer if the file is still used operationally.                        |
| `ambiguous-docker-default`  | Docker appears as an unqualified default.                              | Rewrite it before merging new runtime docs.                                                                                                               |

## Agent Rules

1. For local runtime work, start with Apple Container on supported Macs.
2. Docker Desktop must not be listed as a default local prerequisite for supported Mac local development now that OVE-72 and OVE-73 prove the replacement path.
3. If Docker remains in a new or edited instruction, state one of: unsupported host, CI runner, production Linux process management, temporary fallback issue, or specific missing Apple Container feature.
4. Keep Docker Compose for current production worker/search docs because OVE-76 confirms it as the live-proven Linux droplet process manager. Do not remove it until an explicit production migration proves equivalent restart, health, and journal index/unindex behavior.
5. Keep Docker in GitHub Actions only for CI service-container surfaces where OVE-75 confirms the Apple Container boundary for Ubuntu CI.
6. Do not weaken privacy, media derivative, scoped repository, or search-index boundaries while changing runtime tooling.
7. A corrupt local MinIO volume is never repaired, overwritten, pruned, or silently replaced in place. Use `infra/container-recover-minio` with exact source/target identifiers, preserve the source, and require actual media plus restart persistence proof before accepting the replacement.

## GitHub Actions Boundary

OVE-75 keeps the GitHub Actions workflow on `ubuntu-latest` and keeps Docker-backed services there because GitHub-hosted Ubuntu does not run Apple Container. OVE-95 aligns the CI Postgres service with the production major version by using `postgres:18-alpine`. The current CI Docker usage is limited to the Postgres service container and the MinIO service started for the web job. This preserves the fresh-checkout bootstrap, generated-type drift check, lint, typecheck, tests, and build coverage.

This boundary must not be read as a local runtime requirement. Supported local Mac development remains Apple Container-first through `infra/container-up`; Docker Desktop is not required for the OVE-73-proven web bootstrap path or the OVE-74-proven matching-image smoke path.

Do not replace the CI Docker service path with Apple Container until a separate change records all of the following:

- a supported runner environment, such as macOS 26 on Apple Silicon or another Apple Container-capable runner;
- runner availability, queue-time, concurrency, and cost tradeoffs versus hosted Ubuntu;
- proof that the candidate runner can start the required Postgres, Meilisearch, and MinIO service contracts without weakening CI coverage;
- proof commands for the replacement, including `pnpm local:bootstrap`, `pnpm db:types:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `BETTER_AUTH_SECRET="$(openssl rand -base64 32)" pnpm build`;
- an explicit fallback plan if the Apple Container CI runner is unavailable.

## Production Linux Boundary

OVE-76 confirms the production worker/search droplet is outside the Apple Container migration target. Apple Container is the preferred supported-Mac local runtime, not the process manager for the current DigitalOcean Linux droplet. The production surface remains `production-linux-required` because OVE-39 live-proved Docker Compose restart behavior and worker/search recovery for:

- `matching-worker`, which consumes the Postgres `job_queue`;
- `matching-api`, which exposes the matching health endpoint;
- `meilisearch`, which stores derived public indexes only;
- `caddy`, which terminates TLS for the droplet services.

Docker Compose must stay for this surface until a separate production migration replaces it with a non-Apple Linux process manager such as systemd units, managed services, or another explicit runtime. That replacement is out of scope for the local Apple Container migration and must prove, live and with redacted evidence:

- process restart/reboot recovery for the worker, API, search, and proxy surfaces;
- matching and Meilisearch health endpoints;
- `journal_entry_index` reaching `done` after publish;
- `journal_entry_unindex` reaching `done` after archive;
- the same public-safe Meilisearch document contract from OVE-36/OVE-39;
- no copied DB URLs, worker env files, Meili keys, journal text, IPs, user agents, or user-tied row identifiers.

## OVE-77 Local Closeout

OVE-77 closes the local Docker fallback cleanup for the Apple Container migration chain:

- OVE-71 set the Apple Container-first doctrine.
- OVE-72 added `infra/container-up`, `infra/container-status`, and `infra/container-down` for local Postgres, Meilisearch, and MinIO.
- OVE-73 proved the supported-Mac fresh-checkout web bootstrap with Docker Desktop stopped.
- OVE-74 proved the local matching image plus worker/search smoke on the Apple Container service path.
- OVE-75 kept Docker only as a GitHub-hosted Ubuntu CI platform exception.
- OVE-76 kept Docker Compose only as the current live-proven production Linux process manager.

On supported Apple Silicon/macOS 26 machines, Docker Desktop is no longer a local OverGarden prerequisite. A founder or agent can remove Docker Desktop locally if the current closeout proof passes: `container system status`, `infra/container-up`, `pnpm local:bootstrap`, `pnpm db:types:check`, `pnpm test`, and `uv run --frozen pytest` in `services/matching`. Keep Docker only for unsupported hosts, a documented Apple Container feature gap, GitHub Actions Ubuntu CI, or the production Linux worker/search droplet.

## Current Migration Boundary

OVE-71 changed doctrine and documentation only. OVE-72 adds the supported-Mac Apple Container path for the local Postgres, Meilisearch, and MinIO service trio. OVE-73 proves the fresh-checkout web bootstrap and test path against those Apple Container services with Docker Desktop stopped. OVE-74 proves the local matching image build, health process, worker tests, and Meilisearch Cyrillic/search proof on the Apple Container local service path. OVE-75 confirms GitHub Actions Ubuntu CI as a platform-bound Docker exception. OVE-76 confirms the DigitalOcean Linux worker/search droplet as a production Docker Compose boundary until a separate non-Apple Linux process-manager migration is live-proven. OVE-77 confirms Docker Desktop can be uninstalled locally on supported Macs while preserving documented fallback cases.

The correct end state is not "delete every Docker file." The correct end state is:

- supported local Mac development uses Apple Container without requiring Docker Desktop;
- Docker is still available as a named fallback for unsupported hosts and verified feature gaps;
- Docker remains where Apple Container does not apply, especially GitHub-hosted Ubuntu CI and Linux production, unless a later explicit migration replaces those surfaces with the required runner/cost/proof evidence.
