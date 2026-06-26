# syntax=docker/dockerfile:1
#
# OverGarden matching tier image. Run the FastAPI health service and the worker
# as separate processes from this same image.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libicu-dev \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY . .
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
