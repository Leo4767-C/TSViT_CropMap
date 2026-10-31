########################################################
# TSViT Crop Classification — Production Docker Image
# Multi-stage build: lightweight, optimised for AI inference
########################################################

# ── Stage 1: Builder ──────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build-time OS packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (CPU-only PyTorch to keep image small)
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install \
    torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Runtime ──────────────────────────────────
FROM python:3.12-slim AS runtime

LABEL maintainer="Chuong LV <chuonglv@example.com>"
LABEL description="TSViT Crop Classification — Temporal-Spatial Vision Transformer"
LABEL version="1.0.0"

WORKDIR /app

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source code
COPY models/       ./models/
COPY webapp/        ./webapp/
COPY assets/        ./assets/
COPY Checkpoint/checkpoint/best.pth      ./Checkpoint/checkpoint/best.pth
COPY Checkpoint/checkpoint/config_file.yaml ./Checkpoint/checkpoint/config_file.yaml
COPY configs/       ./configs/
COPY metrics/       ./metrics/
COPY utils/         ./utils/
COPY app.py         .
COPY run_app.py     .
COPY index.html     .
COPY style.css      .
COPY app.js         .
COPY requirements.txt .

# Create non-root user for security
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Health-check: verify the HTTP server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:80/')" || exit 1

# Expose port
EXPOSE 80

# Environment
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Start the web application
CMD ["python", "webapp/server.py", "80"]
