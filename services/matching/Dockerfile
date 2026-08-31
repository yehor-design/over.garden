# syntax=docker/dockerfile:1
#
# OverGarden matching tier image. Run the FastAPI health service and the worker
# as separate processes from this same image.
FROM python:3.12-slim

ARG OVERGARDEN_MATCHING_COMMIT_SHA
ARG OVERGARDEN_MATCHING_BUILD_TIMESTAMP
ARG OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY=ove190.matching-schema.v1

LABEL org.opencontainers.image.title="OverGarden matching tier" \
    org.opencontainers.image.description="Shared API and worker image for the OverGarden matching runtime" \
    org.opencontainers.image.source="https://github.com/yehor-design/over.garden" \
    org.opencontainers.image.revision="${OVERGARDEN_MATCHING_COMMIT_SHA}" \
    org.opencontainers.image.created="${OVERGARDEN_MATCHING_BUILD_TIMESTAMP}" \
    garden.over.matching.schema-compatibility="${OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY}"

COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libicu-dev \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    OVERGARDEN_MATCHING_COMMIT_SHA="${OVERGARDEN_MATCHING_COMMIT_SHA}" \
    OVERGARDEN_MATCHING_BUILD_TIMESTAMP="${OVERGARDEN_MATCHING_BUILD_TIMESTAMP}" \
    OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY="${OVERGARDEN_MATCHING_SCHEMA_COMPATIBILITY}"

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY . .
ENV PATH="/app/.venv/bin:$PATH"

# No port. The worker takes work from Postgres and answers to nobody over HTTP.
# The worker is the service. There is no HTTP surface to serve.
CMD ["python", "-m", "app.worker"]
