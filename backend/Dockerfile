# syntax=docker/dockerfile:1

# ── Stage 1: dependency builder ────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build deps (needed for some compiled packages like pydantic-core)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements first to leverage Docker layer caching
COPY requirements.txt .

# Install into an isolated prefix so we can copy just the packages later
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: lean runtime image ────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Pull installed packages from builder (keeps final image small)
COPY --from=builder /install /usr/local

# Copy application source (build context is already backend/)
COPY server.py .

# Railway (and most platforms) inject PORT; fall back to 8080
ENV PORT=8080 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8080

# Use shell form so $PORT is expanded at runtime
CMD uvicorn server:app \
        --host 0.0.0.0 \
        --port ${PORT} \
        --workers 1 \
        --no-access-log
