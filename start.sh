#!/bin/bash
set -e

echo "========================================="
echo "  DramaBox - Starting on Koyeb"
echo "========================================="

PORT=${PORT:-8000}
echo "[INFO] Port: $PORT"
echo "[INFO] Starting gunicorn..."

exec gunicorn \
    --bind "0.0.0.0:${PORT}" \
    --workers 1 \
    --threads 4 \
    --timeout 120 \
    --keep-alive 5 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --preload \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    wsgi:app
