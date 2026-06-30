# Container Runtime Policy

Status: binding for runtime work started by OVE-71.

Apple Container is the preferred local container runtime for OverGarden on supported Apple Silicon/macOS 26 machines. Docker is retained only where Apple Container is unavailable, unsupported, or missing a specific feature required by the surface being proven. New runtime work must try to move local containerized development to Apple Container first, then document any Docker fallback with a concrete reason.

This policy does not delete every Docker reference immediately. It classifies the remaining references so agents can migrate them deliberately instead of treating Docker Desktop as the default local dependency.

## Fallback Matrix

| Surface | Apple Container target | Docker retained | Reason Docker may remain | Owner |
| --- | --- | --- | --- | --- |
| Supported local Mac development | Yes | Fallback only | OVE-72 provides the Apple Container service trio start/status/down path. OVE-73 proves the fresh-checkout web bootstrap and test path against those services with Docker Desktop stopped, so Docker Desktop is not required for normal local infra work on supported Macs. | OVE-72, OVE-73, OVE-77 |
| Unsupported developer machines | No | Yes | Apple Container is macOS/Apple Silicon scoped. Docker remains the practical fallback for unsupported hosts or older macOS versions. | OVE-77 |
| Local Postgres | Yes | Fallback only | `infra/container-up` starts Postgres on `127.0.0.1:5432` with a named Apple Container volume. Docker Compose remains for unsupported hosts or verified feature gaps. | OVE-72 |
| Local Meilisearch | Yes | Fallback only | `infra/container-up` starts Meilisearch on `127.0.0.1:7700` with a named Apple Container volume and `infra/container-status` checks `/health`. | OVE-72 |
| Local MinIO/S3 emulator | Yes | Fallback only | `infra/container-up` starts MinIO on `127.0.0.1:9000` and console `127.0.0.1:9001` with a named Apple Container volume and readiness check. | OVE-72 |
| Matching image build and local worker/search smoke | Yes | Fallback only | Dockerfile syntax can remain an OCI image recipe, but the local build/run proof should use Apple Container where possible. | OVE-74 |
| GitHub Actions Ubuntu CI | No | Yes | Apple Container is not an Ubuntu CI service-container runtime. Docker is acceptable in CI where the runner requires it. | OVE-75 |
| Production DigitalOcean Linux worker droplet | No | Yes | Apple Container is not a Linux production process manager. Current worker/search durability depends on Docker Compose restart policy and health/recovery proof until a separate Linux deployment decision replaces it. | OVE-76 |
| Historical ADRs, scaffold notes, copied research, and old proof logs | Not operational | Yes, as history | Historical files may describe the runtime that existed when the proof was captured. Current operational instructions must point back to this policy. | OVE-71 |
| Mature Compose-only behavior | Maybe | Yes, with explicit gap | If restart policy, health orchestration, networking, volume, or multi-service semantics cannot be reproduced safely with Apple Container, keep Docker for that exact surface and name the gap. | Any runtime issue |

## Reference Classification

Use these labels when touching docs or Linear issues that still mention Docker:

| Label | Meaning | Required action |
| --- | --- | --- |
| `apple-container-target` | Local containerized development should move to Apple Container. | Implement or verify the Apple Container path before accepting Docker as fallback. |
| `temporary-fallback` | Docker remains only until a named migration issue lands. | Link the owning issue and keep commands clearly marked as fallback. |
| `unsupported-host-fallback` | Apple Container cannot run on the developer host. | Keep Docker instructions, but do not make Docker Desktop the default for supported Macs. |
| `ci-required` | The surface runs on Ubuntu/GitHub Actions or another non-macOS runner. | Docker is allowed; document that Apple Container does not fit the runner. |
| `production-linux-required` | The surface is the current Linux production process manager. | Docker Compose may remain until a new production ADR/process manager supersedes it. |
| `historical-record` | The file records what an older proof used. | Do not rewrite history as if it happened on Apple Container; add a current-policy pointer if the file is still used operationally. |
| `ambiguous-docker-default` | Docker appears as an unqualified default. | Rewrite it before merging new runtime docs. |

## Agent Rules

1. For local runtime work, start with Apple Container on supported Macs.
2. Docker Desktop must not be listed as a default local prerequisite for supported Mac local development now that OVE-72 and OVE-73 prove the replacement path.
3. If Docker remains in a new or edited instruction, state one of: unsupported host, CI runner, production Linux process management, temporary fallback issue, or specific missing Apple Container feature.
4. Keep Docker Compose for current production worker/search docs until OVE-76 explicitly proves the production boundary and records why it stays or what replaces it.
5. Keep Docker in GitHub Actions only where OVE-75 confirms the Apple Container boundary for Ubuntu CI.
6. Do not weaken privacy, media derivative, scoped repository, or search-index boundaries while changing runtime tooling.

## Current Migration Boundary

OVE-71 changed doctrine and documentation only. OVE-72 adds the supported-Mac Apple Container path for the local Postgres, Meilisearch, and MinIO service trio. OVE-73 proves the fresh-checkout web bootstrap and test path against those Apple Container services with Docker Desktop stopped. The migration still does not prove matching image builds, GitHub Actions, or the production worker droplet without Docker.

The correct end state is not "delete every Docker file." The correct end state is:

- supported local Mac development uses Apple Container without requiring Docker Desktop;
- Docker is still available as a named fallback for unsupported hosts and verified feature gaps;
- Docker remains where Apple Container does not apply, especially Ubuntu CI and Linux production, unless a later explicit migration replaces those surfaces.
