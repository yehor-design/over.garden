# syntax=docker/dockerfile:1
#
# OverGarden matching tier image (Railway).
# python:3.12-slim is Debian Trixie -> ICU 76, gcc defaults to c++17, so PyICU
# (which compiles from sdist against system libicu) builds cleanly.
FROM python:3.12-slim

# Pinned uv binary for reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/

# System deps for the PyICU build. KEEP libicu-dev in the final image: the
# compiled PyICU .so is linked against the libicu major version present at build
# (76), and that runtime lib must remain available. Do not prune it.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libicu-dev \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

# Dependency layer (cached): copy only the manifest + lock first.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# App source.
COPY . .
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Default process: the FastAPI service.
# The WORKER runs as a SEPARATE Railway service from the same image, overriding
# the command:  python -m app.worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
