"""FastAPI liveness, immutable capabilities, and dependency readiness."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import runtime

app = FastAPI(title="overgarden-matching-tier", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    """Process liveness only; dependency state belongs to `/ready`."""
    return {
        "schemaVersion": runtime.RUNTIME_SCHEMA_VERSION,
        "status": "available",
        "service": runtime.SERVICE_NAME,
    }


@app.get("/capabilities")
def capabilities() -> JSONResponse:
    try:
        return JSONResponse(runtime.capabilities_manifest(), status_code=200)
    except runtime.RuntimeConfigurationError:
        return JSONResponse(runtime.unavailable_manifest(), status_code=503)


@app.get("/ready")
def ready() -> JSONResponse:
    try:
        manifest, is_ready = runtime.readiness_manifest()
        return JSONResponse(manifest, status_code=200 if is_ready else 503)
    except runtime.RuntimeConfigurationError:
        return JSONResponse(runtime.unavailable_manifest(), status_code=503)
